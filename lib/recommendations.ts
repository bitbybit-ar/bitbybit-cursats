import "server-only";
import {
  and,
  desc,
  eq,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { offerings, orders, users } from "@/lib/db/schema";
import {
  listHighlightedOfferings,
  toOfferingWithSeller,
  type OfferingWithSeller,
} from "@/lib/offerings";

/**
 * Personalised offering recommendations for a signed-in buyer.
 *
 * The buyer signal is mined from their most recent paid orders:
 *   * `signalTags` is the union of tags from offerings the buyer
 *     has already paid for.
 *   * `signalSellers` is the set of user_ids the buyer has bought
 *     from.
 *
 * Candidates are active, non-archived offerings the buyer has not
 * already purchased (any order status) and that are not the buyer's
 * own listings. Each candidate is scored:
 *
 *     score = 2 * |candidate.tags ∩ signalTags|
 *           + (candidate.user_id ∈ signalSellers ? 1 : 0)
 *
 * Tag overlap dominates seller history because a tag co-occurrence
 * is a stronger interest signal than just "bought from this seller
 * once." Order ties by recency so the freshest course wins.
 *
 * If the buyer has no paid orders — or the personalised query
 * returns fewer rows than requested — the result is topped up with
 * `listHighlightedOfferings`, deduped against the personalised
 * picks and the buyer's purchase history. ADR 0024.
 *
 * The `fallback` field on the result lets the UI tailor the
 * subtitle ("Based on tags from your recent purchases" vs "Popular
 * right now"). It reflects *the dominant source* of the returned
 * rows, not the absence of a signal: a buyer with no purchases gets
 * `"highlights"`; a buyer whose tag query returned 2 + 1 highlight
 * top-up gets `"mixed"`.
 */

const RECENT_PAID_ORDERS_LIMIT = 10;

export interface RecommendedOfferingsOpts {
  /** Buyer's Nostr pubkey — drives the signal. */
  pubkey: string;
  /** Default 3. The component caller is /purchases (rail of 3) and
   *  /explore (rail of 4); both are inside the typical signal size. */
  limit?: number;
  /** Offering ids the caller already plans to render elsewhere on
   *  the page, so the rail does not duplicate them. */
  excludeOfferingIds?: string[];
}

/**
 * Discriminator on which source produced the bulk of the rows.
 * Surfaces back to the UI so it can pick the right subtitle copy.
 *
 *   "tags"       — every row matched on tag overlap.
 *   "sellers"    — every row matched on seller history (no tag
 *                  overlap; happens when the buyer's purchases had
 *                  no tags but the seller has other courses).
 *   "highlights" — buyer had no signal, or none of their signal
 *                  produced candidates; everything came from the
 *                  highlights top-up.
 *   "mixed"      — any combination of the above.
 */
export type RecommendationFallback =
  | "tags"
  | "sellers"
  | "highlights"
  | "mixed";

export interface RecommendedOfferings {
  rows: OfferingWithSeller[];
  fallback: RecommendationFallback;
}

export async function listRecommendedOfferings(
  opts: RecommendedOfferingsOpts
): Promise<RecommendedOfferings> {
  const limit = Math.max(1, opts.limit ?? 3);
  const externalExclude = opts.excludeOfferingIds ?? [];

  try {
    const db = getDb();

    // 1. Resolve the buyer's user row so we can exclude their own
    //    offerings — recommending someone their own course would
    //    be embarrassing.
    const [buyerRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.pubkey, opts.pubkey))
      .limit(1);
    const buyerUserId = buyerRow?.id ?? null;

    // 2. The buyer's paid-order signal: tags + sellers, joined off
    //    the offerings they bought. Capped at `RECENT_PAID_ORDERS_
    //    LIMIT` so a power buyer with 200 orders doesn't drag every
    //    tag they ever encountered into the signal.
    const paidSignal = await db
      .select({
        tags: offerings.tags,
        seller_id: offerings.user_id,
      })
      .from(orders)
      .innerJoin(offerings, eq(orders.offering_id, offerings.id))
      .where(and(eq(orders.pubkey, opts.pubkey), eq(orders.status, "paid")))
      .orderBy(desc(orders.created_at))
      .limit(RECENT_PAID_ORDERS_LIMIT);

    const signalTags = Array.from(
      new Set(paidSignal.flatMap((r) => r.tags ?? []))
    );
    const signalSellers = Array.from(
      new Set(paidSignal.map((r) => r.seller_id))
    );

    // 3. Every offering this buyer has touched (any status) — we
    //    don't want pending/failed orders to re-surface as
    //    recommendations either. They already started a flow on
    //    that course; suggesting it again is noise.
    const purchasedRows = await db
      .selectDistinct({ offering_id: orders.offering_id })
      .from(orders)
      .where(eq(orders.pubkey, opts.pubkey));
    const purchasedIds = purchasedRows.map((r) => r.offering_id);

    const excludeIds = Array.from(
      new Set([...purchasedIds, ...externalExclude])
    );

    const hasSignal = signalTags.length > 0 || signalSellers.length > 0;

    let personalised: Array<{
      offering: typeof offerings.$inferSelect;
      seller: typeof users.$inferSelect;
      tag_score: number;
      seller_score: number;
    }> = [];

    if (hasSignal) {
      // Build PG array literals explicitly via `sql.join`. Driver
      // behaviour for raw JS-array bindings against `text[]` /
      // `uuid[]` casts is uneven (some serialise as JSON, which
      // PG's array parser rejects); the explicit
      // `ARRAY[$1, $2, …]::text[]` form is portable and keeps each
      // element a properly-bound parameter.
      const tagsParam = signalTags.length
        ? sql`ARRAY[${sql.join(
            signalTags.map((t) => sql`${t}`),
            sql`, `
          )}]::text[]`
        : null;
      const sellersParam = signalSellers.length
        ? sql`ARRAY[${sql.join(
            signalSellers.map((s) => sql`${s}::uuid`),
            sql`, `
          )}]`
        : null;

      // tag_score = |candidate.tags ∩ signalTags|. We compute the
      // intersection as `ARRAY(SELECT unnest(...) INTERSECT
      // SELECT unnest(...))` and take its cardinality; PG ships no
      // native array-intersect operator at the small scale we need.
      // seller_score is 0/1.
      const tagScoreExpr = tagsParam
        ? sql<number>`
            COALESCE(
              cardinality(
                ARRAY(
                  SELECT unnest(${offerings.tags})
                  INTERSECT
                  SELECT unnest(${tagsParam})
                )
              ),
              0
            )
          `
        : sql<number>`0`;
      const sellerScoreExpr = sellersParam
        ? sql<number>`(CASE WHEN ${offerings.user_id} = ANY(${sellersParam}) THEN 1 ELSE 0 END)`
        : sql<number>`0`;
      const totalScoreExpr = sql<number>`(${tagScoreExpr}) * 2 + (${sellerScoreExpr})`;

      const matchConditions = [];
      if (tagsParam) {
        matchConditions.push(sql`${offerings.tags} && ${tagsParam}`);
      }
      if (sellersParam) {
        matchConditions.push(
          sql`${offerings.user_id} = ANY(${sellersParam})`
        );
      }
      // At this point matchConditions has at least one element
      // because `hasSignal` was true.
      const matchOr = matchConditions.length === 1
        ? matchConditions[0]
        : or(...matchConditions);

      const baseWhere = and(
        eq(users.active, true),
        isNull(offerings.archived_at),
        matchOr,
        buyerUserId
          ? sql`${offerings.user_id} <> ${buyerUserId}`
          : undefined,
        excludeIds.length
          ? notInArray(offerings.id, excludeIds)
          : undefined
      );

      personalised = await db
        .select({
          offering: offerings,
          seller: users,
          tag_score: tagScoreExpr,
          seller_score: sellerScoreExpr,
        })
        .from(offerings)
        .innerJoin(users, eq(offerings.user_id, users.id))
        .where(baseWhere)
        .orderBy(desc(totalScoreExpr), desc(offerings.created_at))
        .limit(limit);
    }

    // 4. Inspect the personalised slice to decide the fallback
    //    discriminator. We do this before topping up so a row from
    //    the highlights branch flips it to "mixed".
    const tagHits = personalised.filter((r) => r.tag_score > 0).length;
    const sellerOnlyHits = personalised.filter(
      (r) => r.tag_score === 0 && r.seller_score > 0
    ).length;

    const picked = personalised.map(toOfferingWithSeller);
    const pickedIds = picked.map((r) => r.offering.id);

    // 5. Top up from highlights when the personalised query
    //    didn't produce enough rows. Highlights itself returns
    //    early on a DB error, so we don't double-error here.
    let topUpCount = 0;
    if (picked.length < limit) {
      const remaining = limit - picked.length;
      // listHighlightedOfferings takes only a limit; we exclude
      // duplicates client-side. The pool is small (≤3 by default)
      // so this is cheap.
      const highlights = await listHighlightedOfferings(
        remaining + pickedIds.length + excludeIds.length
      );
      const excludeForHighlights = new Set([
        ...pickedIds,
        ...excludeIds,
      ]);
      const filteredHighlights = highlights
        .filter((h) => !excludeForHighlights.has(h.offering.id))
        .filter(
          (h) => buyerUserId === null || h.offering.user_id !== buyerUserId
        )
        .slice(0, remaining);
      topUpCount = filteredHighlights.length;
      picked.push(...filteredHighlights);
    }

    const fallback = pickFallback({
      total: picked.length,
      tagHits,
      sellerOnlyHits,
      topUpCount,
    });

    return { rows: picked, fallback };
  } catch (err) {
    console.error("listRecommendedOfferings failed", err);
    return { rows: [], fallback: "highlights" };
  }
}

function pickFallback(opts: {
  total: number;
  tagHits: number;
  sellerOnlyHits: number;
  topUpCount: number;
}): RecommendationFallback {
  if (opts.total === 0) return "highlights";
  const sources = [
    opts.tagHits > 0,
    opts.sellerOnlyHits > 0,
    opts.topUpCount > 0,
  ].filter(Boolean).length;
  if (sources > 1) return "mixed";
  if (opts.tagHits > 0) return "tags";
  if (opts.sellerOnlyHits > 0) return "sellers";
  return "highlights";
}
