import { type NextRequest, NextResponse } from "next/server";
import { runWapuSettlements } from "@/lib/wapu-settlement";

export const dynamic = "force-dynamic";
// Belt-and-suspenders: never let this run as a static/edge function.
export const runtime = "nodejs";

/**
 * Settlement cron for the wapu_ars rail (no webhooks — everything is
 * polled). Runs on the Vercel schedule in vercel.json. Three passes:
 *
 *   1. Pending deposits: catch buyers who paid but closed the
 *      checkout page before its poller saw the confirmation.
 *      `pollWapuDeposit` marks the order paid and opens the seller
 *      withdrawal.
 *   2. Paid orders with no withdrawal opened: retry
 *      `openSellerWithdrawal` (covers a create that failed inline).
 *   3. Pending withdrawals: `pollWapuWithdrawal` settles them to
 *      `released`/`failed` once Wapu reports back (can take hours).
 *
 * Every step is idempotent, so overlapping runs are safe.
 *
 * On Vercel Hobby this runs once a day (vercel.json); sellers can
 * trigger the same sweep for their own orders on demand via the "sync"
 * button on /orders (POST /api/orders/sync). Both share
 * `runWapuSettlements`.
 */

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when the
  // env var is set. Without a configured secret we refuse rather than
  // expose an open settlement endpoint.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runWapuSettlements();
  return NextResponse.json(result);
}
