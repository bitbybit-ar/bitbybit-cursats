import { type NextRequest, NextResponse } from "next/server";
import { drawAndAssignCode, getOrder, markOrderPaid } from "@/lib/orders";
import {
  pollWapuDeposit,
  emitOrderPaidNotifications,
} from "@/lib/wapu-settlement";
import { getLightningClient } from "@/lib/lightning";

/**
 * Status poll for the checkout page. Public — the orderId in the
 * URL is the access key (≥128 bits of entropy, see ADR 0006).
 *
 * Neither rail has a webhook; both are polled on this GET:
 *
 *   - wapu_ars: `pollWapuDeposit` checks the Wapu deposit transaction.
 *     On `Completed` it marks the order paid, draws the code, emits
 *     notifications, and opens the seller's ARS withdrawal.
 *   - direct_lightning: we poll the seller's LUD-21 verify URL; on
 *     `settled` we mark paid + draw code + the same notifications.
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
        status === "paid"
          ? (order.paid_at ?? new Date()).toISOString()
          : null,
    });
  }

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

  return NextResponse.json({
    order_id: order.id,
    status: order.status,
    paid_at: order.paid_at?.toISOString() ?? null,
  });
}
