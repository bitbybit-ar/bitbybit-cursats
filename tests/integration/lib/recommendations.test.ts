// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { testDb, cleanDb, seedUser } from "../setup";
import { offerings, orders } from "@/lib/db/schema";
import { listRecommendedOfferings } from "@/lib/recommendations";

// `listRecommendedOfferings` blends a personalised query (tag
// overlap + seller history off the buyer's recent paid orders)
// with a `listHighlightedOfferings` top-up. These tests pin the
// behaviour around exclusion, scoring, fallback discriminator,
// and pagination edges so future refactors can't silently drift.

beforeAll(async () => {
  const { rows } = await testDb.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'offerings'
    ) AS "exists"
  `);
  if (!rows[0]?.exists) {
    throw new Error(
      "Test database is missing the 'offerings' table. Run `npm run test:db:migrate` first."
    );
  }
});

beforeEach(async () => {
  await cleanDb();
});

// --- Helpers --------------------------------------------------------------

const BUYER_PUBKEY = "b".repeat(64);

// Each test seeds 1–4 sellers + 0–N offerings + 0–N orders. The
// helpers below keep each test focused on the data shape that
// matters (tags, seller, status) instead of repeating the same
// boilerplate inserts.

interface SeedOfferingOpts {
  userId: string;
  slug: string;
  title?: string;
  tags?: string[];
  createdAt?: Date;
}

async function seedOffering(opts: SeedOfferingOpts) {
  const [row] = await testDb
    .insert(offerings)
    .values({
      user_id: opts.userId,
      slug: opts.slug,
      type: "code" as const,
      title: opts.title ?? opts.slug,
      description: "Seed.",
      price_amount: 5000,
      price_currency: "ars" as const,
      image_url: "https://example.com/cover.png",
      tags: opts.tags ?? [],
      code_pool: ["TEST-AAAA", "TEST-BBBB"],
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    })
    .returning();
  return row;
}

interface SeedOrderOpts {
  pubkey: string;
  offeringId: string;
  sellerId: string;
  status?: "pending" | "paid" | "failed" | "refunded";
  createdAt?: Date;
}

async function seedOrder(opts: SeedOrderOpts) {
  const [row] = await testDb
    .insert(orders)
    .values({
      pubkey: opts.pubkey,
      offering_id: opts.offeringId,
      user_id: opts.sellerId,
      status: opts.status ?? "paid",
      amount_ars: 5000,
      amount_sats: 1250,
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    })
    .returning();
  return row;
}

function ids(
  rows: Awaited<ReturnType<typeof listRecommendedOfferings>>["rows"]
) {
  return rows.map((r) => r.offering.id);
}

// --- Tests ----------------------------------------------------------------

describe("recommendations/listRecommendedOfferings", () => {
  it("returns highlights fallback when the buyer has no orders", async () => {
    // No signal → no personalised slice → everything comes from
    // the highlights top-up. Three active offerings are enough to
    // fill the default limit of 3.
    const seller = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });
    await seedOffering({ userId: seller.id, slug: "o-a" });
    await seedOffering({ userId: seller.id, slug: "o-b" });
    await seedOffering({ userId: seller.id, slug: "o-c" });

    const result = await listRecommendedOfferings({ pubkey: BUYER_PUBKEY });

    expect(result.rows).toHaveLength(3);
    expect(result.fallback).toBe("highlights");
  });

  it("ranks tag-overlap candidates and reports the tags fallback", async () => {
    // Buyer bought a yoga offering. The catalog has a second yoga
    // offering and an unrelated one. The yoga match should win.
    const buyer = await seedUser({
      pubkey: BUYER_PUBKEY,
      slug: "buyer",
    });
    const sellerA = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });
    const sellerB = await seedUser({ pubkey: "c".repeat(64), slug: "s-b" });

    const bought = await seedOffering({
      userId: sellerA.id,
      slug: "yoga-101",
      tags: ["yoga", "wellness"],
    });
    const yogaMatch = await seedOffering({
      userId: sellerB.id,
      slug: "yoga-advanced",
      tags: ["yoga"],
    });
    await seedOffering({
      userId: sellerB.id,
      slug: "rust-intro",
      tags: ["rust"],
    });

    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: bought.id,
      sellerId: sellerA.id,
      status: "paid",
    });

    const result = await listRecommendedOfferings({ pubkey: BUYER_PUBKEY });

    // Buyer's own row exists but they have no published offerings,
    // so the buyer-self exclusion is a no-op here. We assert the
    // tag-matched offering is first and the unrelated one is not
    // present, rather than asserting the full row count (highlights
    // top-up may add the rust-intro row).
    expect(buyer.id).toBeTruthy();
    expect(ids(result.rows)[0]).toBe(yogaMatch.id);
    // Already-purchased offering must not appear regardless of fallback.
    expect(ids(result.rows)).not.toContain(bought.id);
    expect(result.fallback === "tags" || result.fallback === "mixed").toBe(
      true
    );
  });

  it("returns the sellers fallback when only the seller signal matches", async () => {
    // Buyer's history has no tags but reveals a seller. Another
    // course from that seller (also untagged) should surface.
    const sellerA = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });
    const sellerB = await seedUser({ pubkey: "c".repeat(64), slug: "s-b" });

    const bought = await seedOffering({
      userId: sellerA.id,
      slug: "intro",
      tags: [],
    });
    const sellerAOther = await seedOffering({
      userId: sellerA.id,
      slug: "advanced",
      tags: [],
    });
    await seedOffering({
      userId: sellerB.id,
      slug: "unrelated",
      tags: [],
    });

    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: bought.id,
      sellerId: sellerA.id,
      status: "paid",
    });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 1,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].offering.id).toBe(sellerAOther.id);
    expect(result.fallback).toBe("sellers");
  });

  it("excludes offerings the buyer has already touched regardless of status", async () => {
    // Paid, pending, failed — all three should be excluded from the
    // recommendations. We give the buyer one signal-bearing paid
    // order so the personalised query has something to chew on; the
    // assertion is about which ids are NOT returned.
    const seller = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });

    const paid = await seedOffering({
      userId: seller.id,
      slug: "paid",
      tags: ["x"],
    });
    const pending = await seedOffering({
      userId: seller.id,
      slug: "pending",
      tags: ["x"],
    });
    const failed = await seedOffering({
      userId: seller.id,
      slug: "failed",
      tags: ["x"],
    });
    // A candidate that should surface (tag-overlap, never touched).
    const candidate = await seedOffering({
      userId: seller.id,
      slug: "candidate",
      tags: ["x"],
    });

    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: paid.id,
      sellerId: seller.id,
      status: "paid",
    });
    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: pending.id,
      sellerId: seller.id,
      status: "pending",
    });
    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: failed.id,
      sellerId: seller.id,
      status: "failed",
    });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 5,
    });

    const returnedIds = ids(result.rows);
    expect(returnedIds).toContain(candidate.id);
    expect(returnedIds).not.toContain(paid.id);
    expect(returnedIds).not.toContain(pending.id);
    expect(returnedIds).not.toContain(failed.id);
  });

  it("excludes the buyer's own offerings", async () => {
    // Buyer is also a seller. Their own course matches the signal
    // (same tags as their purchase) but must not appear in their
    // own recommendations.
    const buyer = await seedUser({
      pubkey: BUYER_PUBKEY,
      slug: "buyer-seller",
    });
    const otherSeller = await seedUser({
      pubkey: "a".repeat(64),
      slug: "s-a",
    });

    const bought = await seedOffering({
      userId: otherSeller.id,
      slug: "yoga-101",
      tags: ["yoga"],
    });
    const buyerOwnYoga = await seedOffering({
      userId: buyer.id,
      slug: "yoga-by-me",
      tags: ["yoga"],
    });
    const ok = await seedOffering({
      userId: otherSeller.id,
      slug: "yoga-other",
      tags: ["yoga"],
    });

    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: bought.id,
      sellerId: otherSeller.id,
      status: "paid",
    });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 5,
    });
    const returnedIds = ids(result.rows);

    expect(returnedIds).toContain(ok.id);
    expect(returnedIds).not.toContain(buyerOwnYoga.id);
  });

  it("honors excludeOfferingIds from the caller", async () => {
    const seller = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });
    const a = await seedOffering({ userId: seller.id, slug: "a" });
    const b = await seedOffering({ userId: seller.id, slug: "b" });
    const c = await seedOffering({ userId: seller.id, slug: "c" });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 3,
      excludeOfferingIds: [a.id, b.id],
    });

    const returnedIds = ids(result.rows);
    expect(returnedIds).not.toContain(a.id);
    expect(returnedIds).not.toContain(b.id);
    expect(returnedIds).toContain(c.id);
  });

  it("tops up from highlights and reports the mixed fallback", async () => {
    // To force a genuine highlights top-up (rather than seller-only
    // hits within the personalised query), we spread candidates
    // across three sellers:
    //   * seller A: holds the buyer's only paid offering — its
    //     tag ("bitcoin") drives the signal, and seller A has no
    //     other catalogue.
    //   * seller B: one course tagged "bitcoin" — the only
    //     personalised hit (tag overlap, no seller match).
    //   * seller C: two unrelated courses — neither tag nor
    //     seller signal touches these, so they only reach the
    //     result via the highlights top-up.
    // Result with limit=3: 1 personalised + 2 top-ups, fallback
    // "mixed".
    const sellerA = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });
    const sellerB = await seedUser({ pubkey: "c".repeat(64), slug: "s-b" });
    const sellerC = await seedUser({ pubkey: "d".repeat(64), slug: "s-c" });

    const bought = await seedOffering({
      userId: sellerA.id,
      slug: "purchased",
      tags: ["bitcoin"],
    });
    const tagged = await seedOffering({
      userId: sellerB.id,
      slug: "match",
      tags: ["bitcoin"],
    });
    await seedOffering({
      userId: sellerC.id,
      slug: "filler-a",
      tags: [],
    });
    await seedOffering({
      userId: sellerC.id,
      slug: "filler-b",
      tags: [],
    });

    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: bought.id,
      sellerId: sellerA.id,
      status: "paid",
    });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 3,
    });

    expect(result.rows).toHaveLength(3);
    // The personalised pick is at the top; the rest is top-up.
    expect(result.rows[0].offering.id).toBe(tagged.id);
    expect(result.fallback).toBe("mixed");
  });

  it("ranks tag-overlap above a seller-only match", async () => {
    // Two non-purchased candidates from the same seller:
    //   * A shares a tag with the buyer's purchase  → score 2 + 1 = 3
    //   * B shares no tag but is from the same seller → score 0 + 1 = 1
    // A must come first.
    const seller = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });

    const bought = await seedOffering({
      userId: seller.id,
      slug: "purchased",
      tags: ["lightning"],
    });
    const tagAndSeller = await seedOffering({
      userId: seller.id,
      slug: "tag-and-seller",
      tags: ["lightning"],
    });
    const sellerOnly = await seedOffering({
      userId: seller.id,
      slug: "seller-only",
      tags: [],
    });

    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: bought.id,
      sellerId: seller.id,
      status: "paid",
    });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 2,
    });

    const returnedIds = ids(result.rows);
    expect(returnedIds[0]).toBe(tagAndSeller.id);
    expect(returnedIds).toContain(sellerOnly.id);
  });

  it("respects the limit parameter", async () => {
    const seller = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });
    for (let i = 0; i < 6; i++) {
      await seedOffering({ userId: seller.id, slug: `o-${i}` });
    }

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 2,
    });

    expect(result.rows).toHaveLength(2);
  });

  it("does not derive signal from pending or failed orders", async () => {
    // Buyer has a *pending* order on a tagged offering. The signal
    // query only reads paid orders, so the buyer has no signal.
    // The matching candidate should reach the result via the
    // highlights top-up (fallback "highlights") rather than the
    // personalised branch (fallback "tags"), and the
    // pending-on offering must still be excluded.
    const seller = await seedUser({ pubkey: "a".repeat(64), slug: "s-a" });

    const pendingOffering = await seedOffering({
      userId: seller.id,
      slug: "pending-buy",
      tags: ["data-science"],
    });
    const matchingCandidate = await seedOffering({
      userId: seller.id,
      slug: "would-match",
      tags: ["data-science"],
    });

    await seedOrder({
      pubkey: BUYER_PUBKEY,
      offeringId: pendingOffering.id,
      sellerId: seller.id,
      status: "pending",
    });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 3,
    });

    const returnedIds = ids(result.rows);
    expect(returnedIds).not.toContain(pendingOffering.id);
    expect(returnedIds).toContain(matchingCandidate.id);
    // No paid orders → no personalised slice → fallback is the
    // top-up source, "highlights".
    expect(result.fallback).toBe("highlights");
  });

  it("skips inactive sellers", async () => {
    // Highlights itself filters on `users.active = true`; the
    // personalised branch also joins on users with the same
    // filter. A muted seller's catalogue must not surface.
    const activeSeller = await seedUser({
      pubkey: "a".repeat(64),
      slug: "active",
      active: true,
    });
    const inactiveSeller = await seedUser({
      pubkey: "c".repeat(64),
      slug: "inactive",
      active: false,
    });

    const visible = await seedOffering({
      userId: activeSeller.id,
      slug: "visible",
    });
    const hidden = await seedOffering({
      userId: inactiveSeller.id,
      slug: "hidden",
    });

    const result = await listRecommendedOfferings({
      pubkey: BUYER_PUBKEY,
      limit: 5,
    });

    const returnedIds = ids(result.rows);
    expect(returnedIds).toContain(visible.id);
    expect(returnedIds).not.toContain(hidden.id);
  });
});
