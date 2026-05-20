import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, OrderCreateError } from "@/lib/orders";
import { getSession } from "@/lib/auth";
import { NostrPubkeySchema } from "@/lib/schemas/primitives";

const CheckoutBodySchema = z.object({
  offering_id: z.string().uuid(),
  /**
   * Pasted at checkout for buyers who want a Nostr DM but no
   * session. Logged-in buyers do not need to send this — the
   * session pubkey wins.
   */
  pubkey: NostrPubkeySchema.optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = CheckoutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Logged-in session always wins over a pasted pubkey: the buyer
  // who took the trouble to sign in is the one we credit, even if
  // the form had a stale value pre-filled.
  const session = await getSession();
  const pubkey = session?.pubkey ?? parsed.data.pubkey ?? null;

  try {
    const result = await createOrder({
      offering_id: parsed.data.offering_id,
      pubkey,
    });
    return NextResponse.json({
      order_id: result.order_id,
      funding: {
        bolt11: result.funding.bolt11,
        amount_sats: result.funding.amount_sats,
        amount_ars: result.funding.amount_ars,
        expires_at: result.funding.expires_at,
      },
    });
  } catch (err) {
    if (err instanceof OrderCreateError) {
      // The seller configuration errors (missing payout, inactive)
      // are platform-side states the buyer cannot fix. The
      // offering_* errors are what they expect when they hit a stale
      // URL.
      // 404 for "this URL no longer points at anything buyable"
      // (gone or never existed). 409 for "this offering exists but
      // can't be sold right now" (sold out — fixable by the seller
      // minting more codes). 503 for "the seller's payout config is
      // wrong" — buyer can't fix that either, but it's a server-
      // side state, not the buyer's stale URL.
      let status: number;
      if (
        err.code === "offering_not_found" ||
        err.code === "offering_archived"
      ) {
        status = 404;
      } else if (err.code === "offering_sold_out") {
        status = 409;
      } else {
        status = 503;
      }
      // When the failure was an LN mint, surface the underlying
      // LightningMintErrorCode so the buyer's UI can show a specific
      // message (provider unreachable vs no LUD-21 vs malformed)
      // instead of a generic "unavailable" toast.
      const body: Record<string, unknown> = {
        error: "offering_unavailable",
        reason: err.code,
      };
      if (err.lightning_code) {
        body.lightning_reason = err.lightning_code;
      }
      return NextResponse.json(body, { status });
    }
    console.error("[checkout] failed:", err);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
}
