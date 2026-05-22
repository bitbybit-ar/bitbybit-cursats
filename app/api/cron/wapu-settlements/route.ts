import { type NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  pollWapuDeposit,
  openSellerWithdrawal,
  pollWapuWithdrawal,
} from "@/lib/wapu-settlement";

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
 */

const BATCH = 100;

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

  const db = getDb();

  // 1. Pending deposits (buyer-left-the-page safety net).
  const pendingDeposits = await db
    .select()
    .from(orders)
    .where(and(eq(orders.rail, "wapu_ars"), eq(orders.status, "pending")))
    .limit(BATCH);
  for (const order of pendingDeposits) {
    await pollWapuDeposit(order);
  }

  // 2. Paid orders whose withdrawal never opened.
  const needWithdrawal = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.rail, "wapu_ars"),
        eq(orders.status, "paid"),
        isNull(orders.payout_status)
      )
    )
    .limit(BATCH);
  for (const order of needWithdrawal) {
    await openSellerWithdrawal(order.id);
  }

  // 3. Pending withdrawals awaiting fiat settlement.
  const pendingPayouts = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.rail, "wapu_ars"), eq(orders.payout_status, "pending"))
    )
    .limit(BATCH);
  for (const order of pendingPayouts) {
    await pollWapuWithdrawal(order);
  }

  return NextResponse.json({
    polled_deposits: pendingDeposits.length,
    retried_withdrawals: needWithdrawal.length,
    polled_payouts: pendingPayouts.length,
  });
}
