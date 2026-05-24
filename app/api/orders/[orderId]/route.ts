import { type NextRequest, NextResponse } from "next/server";
import { drawAndAssignCode, getOrder, markOrderPaid } from "@/lib/orders";
import {
  pollWapuDeposit,
  emitOrderPaidNotifications,
} from "@/lib/wapu-settlement";
import { getLightningClient } from "@/lib/lightning";
import { lookupNwcInvoice } from "@/lib/nwc";
import { getUserById } from "@/lib/admin/users";
import { decrypt } from "@/lib/crypto";

type OrderRow = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

// How long the buyer's checkout page should wait before polling again.
// We hand this to the client so the cadence can vary by rail. The
// wapu_ars and LUD-21 paths are cheap HTTP calls; the NWC path opens a
// fresh Nostr relay connection per poll (no persistent connection in a
// serverless route), so it polls less often to cut connection churn.
// The client also self-schedules (next poll only after the current one
// resolves), so a slow relay round-trip can never pile up overlapping
// connections.
const DEFAULT_POLL_INTERVAL_MS = 3000;
const NWC_POLL_INTERVAL_MS = 6000;

/** True for a pending NWC order (direct_lightning with no verify URL). */
function isNwcPending(order: OrderRow): boolean {
  return (
    order.status === "pending" &&
    order.rail === "direct_lightning" &&
    !order.lnurl_verify_url
  );
}

/**
 * Status poll for the checkout page. Public — the orderId in the
 * URL is the access key (≥128 bits of entropy, see ADR 0006).
 *
 * Neither rail has a webhook; both are polled on this GET:
 *
 *   - wapu_ars: `pollWapuDeposit` checks the Wapu deposit transaction.
 *     On `Completed` it marks the order paid, draws the code, emits
 *     notifications, and opens the seller's ARS withdrawal.
 *   - direct_lightning + LN address: poll the seller's LUD-21 verify
 *     URL; on `settled` mark paid + draw code + notifications.
 *   - direct_lightning + NWC (no verify URL): poll the seller's wallet
 *     via NWC lookup_invoice on the order's payment_hash (ADR 0029).
 *
 * Both paths leave the status untouched on transient upstream
 * failures so the buyer page just polls again.
 *
 * Payload is intentionally minimal — the buyer only needs to know
 * whether to keep waiting or pivot to the receipt page. The full
 * order detail (including the redemption code) lives behind
 * /[locale]/receipt/[orderId].
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse> {
  const { orderId } = await params;
  const order = await getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (order.status === "pending" && order.rail === "wapu_ars") {
    const status = await pollWapuDeposit(order);
    return NextResponse.json({
      order_id: order.id,
      status,
      paid_at:
        status === "paid" ? (order.paid_at ?? new Date()).toISOString() : null,
    });
  }

  // direct_lightning, LN-address sub-method: poll the LUD-21 verify URL.
  if (
    order.status === "pending" &&
    order.rail === "direct_lightning" &&
    order.lnurl_verify_url &&
    order.payment_hash
  ) {
    try {
      const ln = getLightningClient();
      const verify = await ln.pollVerify(order.lnurl_verify_url);
      if (verify.settled) {
        return await settleDirectLightningPaid(order);
      }
    } catch (err) {
      // Verification is best-effort. A transient failure must NOT
      // mark the order paid; report the cached pending state and
      // let the buyer page poll again.
      console.warn(
        `[orders/${order.id}] LUD-21 verify failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // direct_lightning, NWC sub-method (no verify URL): poll the seller's
  // wallet over NWC. The connection is loaded + decrypted server-side
  // at poll time; an in-flight order that predates a settings flip
  // simply stops settling if the connection is gone (rare; the buyer's
  // invoice expires).
  if (
    order.status === "pending" &&
    order.rail === "direct_lightning" &&
    !order.lnurl_verify_url &&
    order.payment_hash
  ) {
    try {
      const seller = await getUserById(order.user_id);
      if (seller?.nwc_uri) {
        const verify = await lookupNwcInvoice(
          decrypt(seller.nwc_uri),
          order.payment_hash
        );
        if (verify.settled) {
          return await settleDirectLightningPaid(order);
        }
      }
    } catch (err) {
      console.warn(
        `[orders/${order.id}] NWC lookup failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({
    order_id: order.id,
    status: order.status,
    paid_at: order.paid_at?.toISOString() ?? null,
    poll_after_ms: isNwcPending(order)
      ? NWC_POLL_INTERVAL_MS
      : DEFAULT_POLL_INTERVAL_MS,
  });
}

/**
 * Shared buyer-paid effects for a direct_lightning order, regardless
 * of sub-method (LUD-21 or NWC): flip to paid (idempotent), draw the
 * redemption code, and emit the buyer/seller notifications.
 */
async function settleDirectLightningPaid(
  order: OrderRow
): Promise<NextResponse> {
  const result = await markOrderPaid({
    order_id: order.id,
    paid_at: new Date(),
  });
  if (result.updated) {
    const draw = await drawAndAssignCode({ order_id: order.id });
    if (draw.status === "pool_empty") {
      console.warn(
        `[orders/${order.id}] code pool empty on direct_lightning settle — manual intervention required`
      );
    }
    await emitOrderPaidNotifications(order);
  }
  return NextResponse.json({
    order_id: order.id,
    status: "paid",
    paid_at: new Date().toISOString(),
  });
}
