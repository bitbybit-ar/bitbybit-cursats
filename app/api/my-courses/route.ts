import { type NextRequest, NextResponse } from "next/server";
import {
  CreateOfferingSchema,
  createOfferingForCreator,
} from "@/lib/creator/offerings";
import { requireUser } from "@/lib/creator/require-user";
import { hasPayoutConfigured, expectedPriceCurrency } from "@/lib/creator/users";
import { quoteSellerPayout } from "@/lib/wapu-settlement";
import { WAPU_MIN_NET_ARS } from "@/lib/wapu-limits";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Reject the create if the seller has no payout destination on
  // file for their current rail — the offering would otherwise be
  // published but unsellable, and the buyer-side checkout would
  // 409 with `seller_payout_missing` at the worst possible moment.
  if (!hasPayoutConfigured(auth.user)) {
    return NextResponse.json(
      { error: "payout_not_configured" },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CreateOfferingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Price currency follows the payout rail (ADR 0026): ARS for the
  // cbu_alias rail, sats for lightning_address. Reject a mismatch
  // rather than silently re-interpret the amount in the wrong unit.
  const expectedCurrency = expectedPriceCurrency(auth.user);
  if (parsed.data.price_currency !== expectedCurrency) {
    return NextResponse.json(
      { error: "price_currency_mismatch", expected: expectedCurrency },
      { status: 400 }
    );
  }

  // On the wapu_ars rail the seller bears the fee, so the withdrawal
  // pays the net (price − fee). Wapu rejects withdrawals below
  // WAPU_MIN_NET_ARS, so a course whose net falls under it could never
  // be paid out — reject it at create time (ADR 0026).
  if (expectedCurrency === "ars") {
    let netArs = parsed.data.price_amount; // coarse fallback if Wapu is unreachable
    try {
      const quote = await quoteSellerPayout(
        parsed.data.price_amount,
        auth.user.transfer_speed
      );
      netArs = quote.net_ars;
    } catch (err) {
      // Wapu blip: fall back to the gross floor so we still reject
      // obviously-too-low prices without hard-blocking on an outage.
      console.warn(
        "[my-courses] payout quote unavailable; flooring on gross price",
        err instanceof Error ? err.message : err
      );
    }
    if (netArs < WAPU_MIN_NET_ARS) {
      return NextResponse.json(
        { error: "price_below_wapu_minimum", min_net_ars: WAPU_MIN_NET_ARS },
        { status: 400 }
      );
    }
  }

  const result = await createOfferingForCreator(
    auth.user.id,
    parsed.data,
    auth.session.pubkey
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    offering: { id: result.offering.id, slug: result.offering.slug },
  });
}
