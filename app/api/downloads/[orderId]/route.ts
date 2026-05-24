import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrder, tryConsumeDownload } from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import {
  MAX_DOWNLOADS_PER_ORDER,
  isDownloadAccessExpired,
} from "@/lib/download-limits";

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
 *   able to redeem from any device with the receipt link. A paid
 *   order grants a *bounded* right to the file: up to
 *   MAX_DOWNLOADS_PER_ORDER fetches, within
 *   DOWNLOAD_ACCESS_WINDOW_DAYS of payment (lib/download-limits.ts).
 *
 * Status checks
 *   - 404 on missing order, missing/archived offering, or
 *     non-download type. We deliberately return 404 (not 403/422)
 *     for the "wrong type" case so the proxy does not reveal
 *     whether an order id exists when the offering type is wrong.
 *   - 403 on `pending` / `failed` / `refunded` order status — the
 *     buyer hasn't paid (yet, or any more).
 *   - 410 once the download window has elapsed (`link_expired`) or
 *     the per-order download cap is reached (`download_limit_reached`).
 *
 * The download counter is bumped atomically and only after every
 * other check passes, so a rejected request never consumes a slot.
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

  // The download link is live for a bounded window after payment.
  if (isDownloadAccessExpired(order.paid_at)) {
    return NextResponse.json({ error: "link_expired" }, { status: 410 });
  }

  // Claim a download slot last, after every other gate, so a 4xx never
  // burns one. The check + increment is atomic (see tryConsumeDownload),
  // so concurrent fetches can't exceed the cap.
  const slot = await tryConsumeDownload(order.id, MAX_DOWNLOADS_PER_ORDER);
  if (!slot.ok) {
    return NextResponse.json(
      { error: "download_limit_reached" },
      { status: 410 }
    );
  }

  return NextResponse.redirect(target.toString(), 302);
}
