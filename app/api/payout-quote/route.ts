import { type NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/creator/require-user";
import { quoteSellerPayout } from "@/lib/wapu-settlement";

export const dynamic = "force-dynamic";

/**
 * Estimate the ARS a wapu_ars seller nets on a given gross price.
 * Used by the create-course form to show the Wapu fee + net payout
 * as the seller types. The seller bears the fee (ADR 0026), so we
 * quote against their own `transfer_speed`.
 *
 * Auth-gated: this hits Wapu's tentative-amount endpoint with our
 * API key, so it must not be open to the public.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const amount = (body as { amount_ars?: unknown }).amount_ars;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  try {
    const quote = await quoteSellerPayout(
      Math.round(amount),
      auth.user.transfer_speed
    );
    return NextResponse.json(quote);
  } catch (err) {
    console.warn(
      "[payout-quote] tentative-amount failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "quote_unavailable" }, { status: 502 });
  }
}
