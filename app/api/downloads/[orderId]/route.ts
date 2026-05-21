import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrder } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";

const ParamsSchema = z.object({ orderId: z.string().uuid() });

/**
 * Buyer-facing download proxy for `type=download` offerings. The
 * receipt page links here instead of the raw `offering.download_url`
 * so the source URL stays out of the public DOM and the proxy can
 * enforce the access checks below.
 *
 * Access model
 *   The orderId in the URL is the access key (≥128-bit entropy
 *   per ADR 0006). No session required — anonymous buyers must be
 *   able to redeem from any device with the receipt link.
 *
 * Status checks
 *   - 404 on missing order, missing/archived offering, or
 *     non-download type. We deliberately return 404 (not 403/422)
 *     for the "wrong type" case so the proxy does not reveal
 *     whether an order id exists when the offering type is wrong.
 *   - 403 on `pending` / `failed` / `refunded` order status — the
 *     buyer hasn't paid (yet, or any more).
 *
 * Future hardening (not in this commit)
 *   - Per-order expiry (e.g. 24h after `paid_at`) — ADR 0006 names
 *     this; we'll need a comparator here once we wire it.
 *   - Single-use semantics — track download count on a new column
 *     or a separate `downloads` table; this proxy is the single
 *     point that decrements / refuses.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse> {
  const resolved = await params;
  const parsed = ParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_order_id" }, { status: 400 });
  }

  const order = await getOrder(parsed.data.orderId);
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (order.status !== "paid") {
    return NextResponse.json({ error: "not_paid" }, { status: 403 });
  }

  const offering = await getOfferingById(order.offering_id);
  if (
    !offering ||
    offering.archived_at !== null ||
    offering.type !== "download" ||
    !offering.download_url
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Defence-in-depth against `javascript:`/`data:` URLs that may have
  // landed in legacy rows before the schema was tightened. Same opaque
  // 404 the rest of this route uses so the proxy never tells callers
  // whether a misconfigured row exists.
  let target: URL;
  try {
    target = new URL(offering.download_url);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (target.protocol !== "https:") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(target.toString(), 302);
}
