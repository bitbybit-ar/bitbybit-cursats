import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mintCodesForOffering } from "@/lib/creator/offerings";
import { requireUser } from "@/lib/creator/require-user";

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  count: z.number().int().positive().max(10_000),
});

/**
 * Append freshly-minted redemption codes to a code-type offering's
 * pool. Separate from PATCH /api/my-courses/[id] so the mint is a
 * distinct audit action and so accidental edits to other fields
 * cannot piggyback a code mint.
 */
export async function POST(
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

  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsedBody.error.issues },
      { status: 400 }
    );
  }

  const result = await mintCodesForOffering(
    auth.user.id,
    parsedParams.data.id,
    parsedBody.data.count,
    auth.session.pubkey
  );
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    minted: result.minted,
    pool_size: result.offering.code_pool?.length ?? 0,
  });
}
