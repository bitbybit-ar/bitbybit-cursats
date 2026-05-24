import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteOfferingForCreator } from "@/lib/creator/offerings";
import { requireUser } from "@/lib/creator/require-user";

const ParamsSchema = z.object({ id: z.string().uuid() });

/**
 * Permanently delete an offering. Distinct from
 * `DELETE /api/my-courses/[id]`, which is the reversible archive.
 * Refused with 409 `has_sales` while any order references the
 * offering — the seller archives instead (ADR 0031).
 */
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

  const result = await deleteOfferingForCreator(
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
