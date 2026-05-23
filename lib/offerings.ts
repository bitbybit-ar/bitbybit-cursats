import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { offerings, orders, users } from "@/lib/db/schema";
import { getSatsPerArs } from "@/lib/exchange-rate";
import type { OfferingTypeFilter, SortKey } from "@/lib/explore-params";

export type Offering = typeof offerings.$inferSelect;

/**
 * The shape used by buyer-flow renders that need the seller card
 * alongside the offering (discovery home, seller storefront,
 * offering detail header). Keeps the join centralised so consumers
 * do not duplicate the active-user filter.
 */
export interface OfferingWithSeller {
  offering: Offering;
  seller: {
    id: string;
    slug: string;
    display_name: string;
    avatar_url: string | null;
    banner_url: string | null;
    bio: string | null;
  };
}

/**
 * Storefront-header view of a seller — the discovery `seller` fields
 * plus the two the redesigned profile header needs: `pubkey` (for the
 * npub QR + njump link + kind:0 lookup) and `lightning_address` (for
 * the zap button + LN-address QR). Kept separate from
 * `OfferingWithSeller["seller"]` so the many discovery consumers of
 * that shape don't have to thread these through.
 */
export interface StorefrontSeller {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  pubkey: string;
  lightning_address: string | null;
}

export function toOfferingWithSeller(row: {
  offering: Offering;
  seller: typeof users.$inferSelect;
}): OfferingWithSeller {
  return {
    offering: row.offering,
    seller: {
      id: row.seller.id,
      slug: row.seller.slug,
      display_name: row.seller.display_name,
      avatar_url: row.seller.avatar_url,
      banner_url: row.seller.banner_url,
      bio: row.seller.bio,
    },
  };
}

/**
 * Discovery home with search/filter/sort/pagination. The page reads
 * `searchParams` and hands them here normalized; this function applies
 * them, returning the slice for the requested page plus the total row
 * count so the caller can render a pager.
 */
export interface DiscoveryQuery {
  q?: string;
  type?: OfferingTypeFilter;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
  /**
   * Offering ids the caller already plans to render elsewhere on
   * the page (e.g. the personalised rail on `/explore` for
   * logged-in users). Excluded from both the page slice AND the
   * total count so the pager math stays correct. ADR 0024.
   */
  excludeOfferingIds?: string[];
}

export async function listDiscoveryOfferingsPaged(
  opts: DiscoveryQuery = {}
): Promise<{ rows: OfferingWithSeller[]; total: number }> {
  const sort: SortKey = opts.sort ?? "newest";
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 12);
  const offset = (page - 1) * pageSize;
  const q = opts.q?.trim();
  const excludeIds = opts.excludeOfferingIds ?? [];

  try {
    const db = getDb();
    const conditions: SQL[] = [
      eq(users.active, true),
      isNull(offerings.archived_at),
    ];
    if (opts.type) conditions.push(eq(offerings.type, opts.type));
    if (excludeIds.length > 0) {
      conditions.push(notInArray(offerings.id, excludeIds));
    }
    if (q) {
      // Escape LIKE metacharacters so a `%` in user input matches
      // literally instead of acting as a wildcard.
      const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      // Tag matches are exact rather than ILIKE — tags are
      // constrained kebab-case (see `TagSchema` in
      // `lib/admin/offerings.ts`), so a partial LIKE would create
      // noisy cross-tag hits ("art" would match "martial-arts").
      // The GIN index makes `= ANY(tags)` cheap. ADR 0024.
      const search = or(
        ilike(offerings.title, pattern),
        ilike(offerings.description, pattern),
        ilike(users.display_name, pattern),
        sql`${q.toLowerCase()} = ANY(${offerings.tags})`
      );
      if (search) conditions.push(search);
    }
    const whereClause = and(...conditions);

    // Normalise to ARS in SQL so price sorts behave the same whether
    // the seller chose ARS or sats. The rate is locked at query time
    // — a rate move mid-page won't reshuffle pagination.
    const rate = await getSatsPerArs();
    const priceArsEquiv = sql<number>`CASE WHEN ${offerings.price_currency} = 'ars' THEN ${offerings.price_amount} ELSE (${offerings.price_amount}::float / ${rate})::int END`;

    const orderBy =
      sort === "oldest"
        ? asc(offerings.created_at)
        : sort === "price_asc"
          ? asc(priceArsEquiv)
          : sort === "price_desc"
            ? desc(priceArsEquiv)
            : desc(offerings.created_at);

    const [rowsRaw, totalRaw] = await Promise.all([
      db
        .select({ offering: offerings, seller: users })
        .from(offerings)
        .innerJoin(users, eq(offerings.user_id, users.id))
        .where(whereClause)
        .orderBy(orderBy)
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(offerings)
        .innerJoin(users, eq(offerings.user_id, users.id))
        .where(whereClause),
    ]);

    return {
      rows: rowsRaw.map(toOfferingWithSeller),
      total: totalRaw[0].value,
    };
  } catch (err) {
    console.error("listDiscoveryOfferingsPaged failed", err);
    return { rows: [], total: 0 };
  }
}

/**
 * Landing-page highlight rail: up to `limit` offerings ranked by paid
 * order count, topped up with the newest active offerings when fewer
 * than `limit` have sales yet. Returns an empty array on a fresh
 * install (or on DB error) so the landing can hide the section.
 */
export async function listHighlightedOfferings(
  limit = 3
): Promise<OfferingWithSeller[]> {
  try {
    const db = getDb();
    const baseConditions = and(
      eq(users.active, true),
      isNull(offerings.archived_at)
    );

    const topSellers = await db
      .select({ offering: offerings, seller: users })
      .from(offerings)
      .innerJoin(users, eq(offerings.user_id, users.id))
      .innerJoin(
        orders,
        and(eq(orders.offering_id, offerings.id), eq(orders.status, "paid"))
      )
      .where(baseConditions)
      .groupBy(offerings.id, users.id)
      .orderBy(
        desc(sql<number>`count(${orders.id})`),
        desc(offerings.created_at)
      )
      .limit(limit);

    const picked = topSellers.map(toOfferingWithSeller);
    if (picked.length >= limit) return picked;

    const excludeIds = picked.map((r) => r.offering.id);
    const newest = await db
      .select({ offering: offerings, seller: users })
      .from(offerings)
      .innerJoin(users, eq(offerings.user_id, users.id))
      .where(
        excludeIds.length > 0
          ? and(baseConditions, notInArray(offerings.id, excludeIds))
          : baseConditions
      )
      .orderBy(desc(offerings.created_at))
      .limit(limit - picked.length);

    return [...picked, ...newest.map(toOfferingWithSeller)];
  } catch (err) {
    console.error("listHighlightedOfferings failed", err);
    return [];
  }
}

/**
 * Single user's public storefront listing — active rows in
 * insertion order so the seller's first listing stays at the top
 * until they archive it.
 */
export async function listOfferingsForUserSlug(userSlug: string): Promise<{
  seller: StorefrontSeller;
  offerings: Offering[];
} | null> {
  try {
    const db = getDb();
    const [seller] = await db
      .select()
      .from(users)
      .where(and(eq(users.slug, userSlug), eq(users.active, true)))
      .limit(1);
    if (!seller) return null;

    const rows = await db
      .select()
      .from(offerings)
      .where(
        and(eq(offerings.user_id, seller.id), isNull(offerings.archived_at))
      )
      .orderBy(asc(offerings.created_at));

    return {
      seller: {
        id: seller.id,
        slug: seller.slug,
        display_name: seller.display_name,
        avatar_url: seller.avatar_url,
        banner_url: seller.banner_url,
        bio: seller.bio,
        pubkey: seller.pubkey,
        lightning_address: seller.lightning_address,
      },
      offerings: rows,
    };
  } catch (err) {
    console.error("listOfferingsForUserSlug failed", err);
    return null;
  }
}

/**
 * Detail read for `/[locale]/[userSlug]/c/[offeringSlug]`.
 * Returns null when either the user or offering is missing,
 * archived, or deactivated, so the route can 404 without a separate
 * active/archived check.
 */
export async function getOfferingByUserAndSlug(
  userSlug: string,
  offeringSlug: string
): Promise<OfferingWithSeller | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ offering: offerings, seller: users })
      .from(offerings)
      .innerJoin(users, eq(offerings.user_id, users.id))
      .where(
        and(
          eq(users.slug, userSlug),
          eq(offerings.slug, offeringSlug),
          eq(users.active, true),
          isNull(offerings.archived_at)
        )
      )
      .limit(1);
    if (!row) return null;
    return toOfferingWithSeller(row);
  } catch (err) {
    console.error("getOfferingByUserAndSlug failed", err);
    return null;
  }
}

export async function getOfferingById(id: string): Promise<Offering | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(offerings)
    .where(eq(offerings.id, id))
    .limit(1);
  return row ?? null;
}
