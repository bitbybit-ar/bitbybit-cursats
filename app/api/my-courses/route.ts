import { type NextRequest, NextResponse } from "next/server";
import {
  CreateOfferingSchema,
  createOfferingForAdmin,
} from "@/lib/admin/offerings";
import { requireUser } from "@/lib/admin/require-user";
import { hasPayoutConfigured } from "@/lib/admin/users";

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

  const result = await createOfferingForAdmin(
    auth.user.id,
    parsed.data,
    auth.session.pubkey
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: 409 }
    );
  }

  return NextResponse.json({
    offering: { id: result.offering.id, slug: result.offering.slug },
  });
}
