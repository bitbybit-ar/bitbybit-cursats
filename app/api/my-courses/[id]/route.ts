import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  UpdateOfferingSchema,
  updateOfferingForCreator,
  archiveOfferingForCreator,
} from "@/lib/creator/offerings";
import { requireUser } from "@/lib/creator/require-user";
import { expectedPriceCurrency } from "@/lib/creator/users";
import { quoteSellerPayout } from "@/lib/wapu-settlement";
import { WAPU_MIN_NET_ARS } from "@/lib/wapu-limits";

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const resolved = await params;
  const parsedParams = ParamsSchema.safeParse(resolved);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsedBody = UpdateOfferingSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsedBody.error.issues },
      { status: 400 }
    );
  }

  // Same wapu_ars net floor as create: an edited ARS price must still
  // leave the seller a net payout that clears Wapu's minimum (ADR 0026).
  if (
    parsedBody.data.price_amount !== undefined &&
    expectedPriceCurrency(auth.user) === "ars"
  ) {
    let netArs = parsedBody.data.price_amount; // coarse fallback if Wapu is unreachable
    try {
      const quote = await quoteSellerPayout(
        parsedBody.data.price_amount,
        auth.user.transfer_speed
      );
      netArs = quote.net_ars;
    } catch (err) {
      // Wapu blip: fall back to the gross floor.
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

  const result = await updateOfferingForCreator(
    auth.user.id,
    parsedParams.data.id,
    parsedBody.data,
    auth.session.pubkey
  );
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    offering: { id: result.offering.id, slug: result.offering.slug },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const resolved = await params;
  const parsed = ParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const result = await archiveOfferingForCreator(
    auth.user.id,
    parsed.data.id,
    auth.session.pubkey
  );
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
