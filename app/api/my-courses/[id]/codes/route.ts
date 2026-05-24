import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOfferingForCreatorById } from "@/lib/creator/offerings";
import { requireUser } from "@/lib/creator/require-user";

const ParamsSchema = z.object({ id: z.string().uuid() });

/**
 * CSV dump of the offering's unused redemption codes. Sellers use
 * this to back up the codes they minted before distributing. Used
 * codes (already drawn by paid orders) are not included here — the
 * seller can see those by looking at their `/orders` history.
 *
 * The response is CSV with a single column header `code` so a
 * spreadsheet open-in-browser is enough for the seller to inspect.
 */
export async function GET(
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

  const offering = await getOfferingForCreatorById(auth.user.id, parsed.data.id);
  if (!offering) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (offering.type !== "code") {
    return NextResponse.json({ error: "wrong_type" }, { status: 409 });
  }

  const codes = offering.code_pool ?? [];
  const csv = ["code", ...codes].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${offering.slug}-codes.csv"`,
    },
  });
}
