import { NextResponse } from "next/server";
import { requireUser } from "@/lib/admin/require-user";
import { runWapuSettlements } from "@/lib/wapu-settlement";

export const dynamic = "force-dynamic";
// Polls Wapu over the network; never static/edge.
export const runtime = "nodejs";

/**
 * On-demand settlement sweep for the signed-in seller's own orders.
 * Runs the same idempotent passes as the daily cron
 * (`/api/cron/wapu-settlements`) but scoped to `auth.user.id`, so a
 * seller can verify their deposits/payouts without waiting for the
 * once-a-day cron (Vercel Hobby caps crons at daily). Backs the "sync"
 * button on /orders.
 */
export async function POST(): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const result = await runWapuSettlements({ userId: auth.user.id });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[orders/sync] settlement sweep failed", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
