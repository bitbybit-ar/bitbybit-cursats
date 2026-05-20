import { type NextRequest, NextResponse } from "next/server";
import {
  CreateOfferingSchema,
  createOfferingForAdmin,
} from "@/lib/admin/offerings";
import { requireUser } from "@/lib/admin/require-user";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

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
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    offering: { id: result.offering.id, slug: result.offering.slug },
  });
}
