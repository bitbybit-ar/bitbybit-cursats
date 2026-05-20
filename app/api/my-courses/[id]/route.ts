import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  UpdateOfferingSchema,
  updateOfferingForAdmin,
  archiveOfferingForAdmin,
} from "@/lib/admin/offerings";
import { requireUser } from "@/lib/admin/require-user";

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

  const result = await updateOfferingForAdmin(
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

  const result = await archiveOfferingForAdmin(
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
