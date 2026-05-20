import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listRecommendedOfferings } from "@/lib/recommendations";

// Session-gated personalised recommendations (ADR 0024).
// /purchases and /explore call `listRecommendedOfferings` directly
// from their server components — this route exists for any future
// client-side surface (e.g. an in-page "show me more" refresh)
// that needs a small JSON endpoint.
//
// Private cache for 60s: recommendations are pubkey-scoped so a
// shared CDN would mix users; the short window protects against
// rapid re-renders without making the rail feel stale.
export const dynamic = "force-dynamic";

const MAX_LIMIT = 12;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 3;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : 3;

  // `exclude` is a comma-separated list of offering ids to keep
  // out of the rail (the caller already plans to render them
  // elsewhere on the page). We don't validate UUID shape here —
  // an invalid id just won't match, and the DB query is
  // parameterised so there's no injection surface.
  const excludeOfferingIds = (url.searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { rows, fallback } = await listRecommendedOfferings({
    pubkey: session.pubkey,
    limit,
    excludeOfferingIds,
  });

  return NextResponse.json(
    { rows, fallback },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    }
  );
}
