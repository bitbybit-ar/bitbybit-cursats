import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWapuClient } from "@/lib/wapu";
import { drawAndAssignCode, getOrder, markOrderPaid } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import { getUserById } from "@/lib/admin/users";
import { emitNotification } from "@/lib/notifications";

const SIGNATURE_HEADER = "x-wapu-signature";

// TODO(Q1): the real Wapu direct-payment settlement webhook shape
// has not been published yet (PR wapu-app/wapu-cli#7 covers
// outbound only). For the marketplace MVP we mirror the prior
// invoice-keyed shape with `tentative_uuid` and an
// `direct_fiat.*` event-type vocabulary; the MockWapuClient's
// `signWebhookPayload` produces this same shape so integration
// tests still pass. Revisit once Andy publishes the spec.
const WebhookEventSchema = z.object({
  event_type: z.enum([
    "direct_fiat.paid",
    "direct_fiat.expired",
    "direct_fiat.failed",
  ]),
  tentative_uuid: z.string(),
  payment_hash: z.string(),
  occurred_at: z.number().int().nonnegative(),
  amount_sats: z.number().int().nonnegative(),
  amount_ars: z.number().int().nonnegative(),
  external_id: z.string(),
  settlement_ref: z.string().nullable(),
});

/**
 * Wapu webhook receiver.
 *
 * Order of operations matters:
 *   1. Read the RAW body (not the parsed JSON). The signature is
 *      computed over the exact bytes Wapu sent; re-serialising via
 *      `req.json()` would change whitespace and key order, breaking
 *      the verification.
 *   2. Verify the signature via the WapuClient. CLAUDE.md rule:
 *      "Verify Wapu webhook signatures. Every incoming webhook must
 *      be authenticated before any state change."
 *   3. Only then parse and act on the payload.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get(SIGNATURE_HEADER);

  const wapu = getWapuClient();
  if (!wapu.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let parsed: z.infer<typeof WebhookEventSchema>;
  try {
    parsed = WebhookEventSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  if (parsed.event_type !== "direct_fiat.paid") {
    // expired / failed are real events but not implemented in v1 —
    // the order stays in `pending` until the invoice TTL elapses
    // and the storefront tells the buyer to try again. Returning
    // 200 prevents Wapu from retrying these forever.
    return NextResponse.json({ ok: true, ignored: parsed.event_type });
  }

  // Rail guard (ADR 0015). A Wapu webhook may only flip a wapu_ars
  // order. If it lands on a direct_lightning order — bug, replay,
  // or misconfiguration — refuse to mutate and 404 with no body so
  // we do not leak that the order exists. An unknown order id falls
  // through to the markOrderPaid path below (which returns a 200
  // ignored so Wapu stops retrying).
  const existingOrder = await getOrder(parsed.external_id);
  if (existingOrder && existingOrder.rail !== "wapu_ars") {
    console.warn(
      `[wapu/webhook] refused: order ${parsed.external_id} has rail=${existingOrder.rail}`
    );
    return new NextResponse(null, { status: 404 });
  }

  try {
    const result = await markOrderPaid({
      order_id: parsed.external_id,
      payment_hash: parsed.payment_hash,
      settlement_ref: parsed.settlement_ref,
      paid_at: new Date(parsed.occurred_at * 1000),
    });

    // Draw a redemption code on the SAME webhook delivery that
    // flipped the order to paid. Idempotent: a second delivery for
    // the same order short-circuits via `already_assigned` without
    // burning another code from the pool. For `type=download`
    // offerings the helper no-ops; the receipt page proxies the
    // download URL via /api/downloads/[orderId] instead.
    let drawStatus: string | null = null;
    if (result.updated) {
      const draw = await drawAndAssignCode({
        order_id: parsed.external_id,
      });
      drawStatus = draw.status;
      if (draw.status === "pool_empty") {
        // Real seller problem — they sold something they have no
        // codes left for. Loud log so it shows up in the panel /
        // monitoring; the receipt page renders the graceful
        // "tu código está siendo asignado" pending state.
        console.warn(
          `[wapu/webhook] code pool empty for order ${parsed.external_id} — manual intervention required`
        );
      }

      // Fan out in-app notifications. Buyer gets `order.paid` only
      // when they signed in at checkout (anonymous orders carry no
      // recipient). Seller always gets `sale.received`. Failures
      // here are non-fatal — the order is already paid.
      try {
        const order = await getOrder(parsed.external_id);
        if (order) {
          const [offering, seller] = await Promise.all([
            getOfferingById(order.offering_id),
            getUserById(order.user_id),
          ]);
          const offeringTitle = offering?.title ?? "";
          const payload = {
            order_id: order.id,
            offering_title: offeringTitle,
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
        }
      } catch (err) {
        console.warn("[wapu/webhook] notification emit failed:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      draw: drawStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    if (message.includes("not found")) {
      // The webhook references an order id we do not have. Most
      // likely a duplicate/late delivery for an order that was
      // cleaned up, or a misdirected event from another deployment.
      // 200 to stop retries; log so we can investigate.
      console.warn(`[wapu/webhook] unknown order: ${parsed.external_id}`);
      return NextResponse.json({ ok: true, ignored: "unknown_order" });
    }
    // Log full detail for our own debugging; respond with a
    // generic body so we don't leak schema/order-state hints to a
    // caller probing the endpoint with forged-but-signed payloads.
    console.error("[wapu/webhook] mark-paid failed:", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
