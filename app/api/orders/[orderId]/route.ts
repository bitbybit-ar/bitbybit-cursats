import { type NextRequest, NextResponse } from "next/server";
import { drawAndAssignCode, getOrder, markOrderPaid } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import { getUserById } from "@/lib/admin/users";
import { emitNotification } from "@/lib/notifications";
import { getLightningClient } from "@/lib/lightning";

/**
 * Status poll for the checkout page. Public — the orderId in the
 * URL is the access key (≥128 bits of entropy, see ADR 0006).
 *
 * Rails (ADR 0015):
 *
 *   - wapu_ars: the Wapu webhook flips the row to `paid`. This GET
 *     is just a DB read.
 *   - direct_lightning: there is no webhook. We poll the seller's
 *     LUD-21 verify URL on each status check, and if the upstream
 *     reports `settled: true`, we run markOrderPaid + drawAndAssignCode
 *     + the same notifications fan-out as the Wapu path. Failures
 *     (timeouts, 5xx, malformed responses) leave the status untouched
 *     so the buyer page polls again.
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
          payment_hash: order.payment_hash,
          settlement_ref: null,
          paid_at: new Date(),
        });
        if (result.updated) {
          const draw = await drawAndAssignCode({ order_id: order.id });
          if (draw.status === "pool_empty") {
            console.warn(
              `[orders/${order.id}] code pool empty on direct_lightning settle — manual intervention required`
            );
          }
          // Mirror the Wapu webhook's notifications fan-out: buyer
          // (when signed in) gets order.paid, seller always gets
          // sale.received. Non-fatal if the emit fails — order is
          // already paid.
          try {
            const [offering, seller] = await Promise.all([
              getOfferingById(order.offering_id),
              getUserById(order.user_id),
            ]);
            const payload = {
              order_id: order.id,
              offering_title: offering?.title ?? "",
            };
            if (order.pubkey) {
              await emitNotification({
                recipient_pubkey: order.pubkey,
                kind: "order.paid",
                payload,
              });
            }
            if (seller?.pubkey) {
              await emitNotification({
                recipient_pubkey: seller.pubkey,
                kind: "sale.received",
                payload,
              });
            }
          } catch (err) {
            console.warn(`[orders/${order.id}] notification emit failed:`, err);
          }
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
