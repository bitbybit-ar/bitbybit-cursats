// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import { testDb, cleanDb, seedUser } from "../../setup";
import { adminAuditLog, orders } from "@/lib/db/schema";
import {
  createOfferingForCreator,
  updateOfferingForCreator,
  archiveOfferingForCreator,
  deleteOfferingForCreator,
  listAllOfferings,
  listArchivedOfferings,
  getOfferingForCreator,
} from "@/lib/creator/offerings";

const ACTOR = "a".repeat(64);

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

describe("admin/offerings/createOfferingForCreator", () => {
  it("inserts a code offering with a server-minted pool and writes an audit row", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const result = await createOfferingForCreator(
      user.id,
      {
        slug: "intro-bitcoin",
        type: "code",
        title: "Intro a Bitcoin",
        description: "Taller online.",
        price_amount: 5000,
        price_currency: "ars" as const,
        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offering.slug).toBe("intro-bitcoin");
    expect(result.offering.user_id).toBe(user.id);
    // ADR 0019 follow-on: the server mints `code_count` unique
    // codes server-side. Each code is the platform's 8-char
    // alphanumeric format (4-4 with a hyphen, e.g. NF26-HJVU).
    expect(result.offering.code_pool).toHaveLength(5);
    for (const code of result.offering.code_pool ?? []) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }

    const audit = await testDb.select().from(adminAuditLog);
    expect(audit.length).toBe(1);
    expect(audit[0].actor_pubkey).toBe(ACTOR);
    expect(audit[0].user_id).toBe(user.id);
    expect(audit[0].action).toBe("create");
  });

  it("rejects a duplicate slug within one user with slug_taken", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    await createOfferingForCreator(
      user.id,
      {
        slug: "dupe",
        type: "code",
        title: "First",
        description: "First.",
        price_amount: 1000,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    const second = await createOfferingForCreator(
      user.id,
      {
        slug: "dupe",
        type: "code",
        title: "Second",
        description: "Second.",
        price_amount: 2000,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("slug_taken");
  });

  it("allows the same slug across different users", async () => {
    const a = await seedUser({
      pubkey: "a".repeat(64),
      slug: "merch-a",
    });
    const b = await seedUser({
      pubkey: "b".repeat(64),
      slug: "merch-b",
    });
    const fromA = await createOfferingForCreator(
      a.id,
      {
        slug: "shared-slug",
        type: "code",
        title: "From A",
        description: "From A.",
        price_amount: 1000,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      a.pubkey
    );
    const fromB = await createOfferingForCreator(
      b.id,
      {
        slug: "shared-slug",
        type: "code",
        title: "From B",
        description: "From B.",
        price_amount: 1000,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      b.pubkey
    );
    expect(fromA.ok).toBe(true);
    expect(fromB.ok).toBe(true);
  });
});

describe("admin/offerings/updateOfferingForCreator", () => {
  it("updates editable fields and writes an audit row with the changed keys", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const created = await createOfferingForCreator(
      user.id,
      {
        slug: "to-edit",
        type: "code",
        title: "Original",
        description: "Original.",
        price_amount: 1000,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    if (!created.ok) throw new Error("seed failed");

    const updated = await updateOfferingForCreator(
      user.id,
      created.offering.id,
      { title: "New title", price_amount: 1500, price_currency: "ars" },
      ACTOR
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.offering.title).toBe("New title");
    expect(updated.offering.price_amount).toBe(1500);
    expect(updated.offering.slug).toBe("to-edit");

    const auditRows = await testDb
      .select()
      .from(adminAuditLog)
      .where(eq(adminAuditLog.action, "update"));
    expect(auditRows.length).toBe(1);
    const diff = auditRows[0].payload_diff as { changed: string[] };
    expect(diff.changed.sort()).toEqual(["price_amount", "title"]);
  });

  it("returns not_found for an unknown id", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const res = await updateOfferingForCreator(
      user.id,
      "00000000-0000-0000-0000-000000000000",
      { title: "X" },
      ACTOR
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("not_found");
  });

  it("returns not_found when the id belongs to another user (cross-tenant scoping)", async () => {
    const owner = await seedUser({
      pubkey: "a".repeat(64),
      slug: "owner",
    });
    const intruder = await seedUser({
      pubkey: "b".repeat(64),
      slug: "intruder",
    });
    const created = await createOfferingForCreator(
      owner.id,
      {
        slug: "private",
        type: "code",
        title: "Private",
        description: "Private.",
        price_amount: 1000,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      owner.pubkey
    );
    if (!created.ok) throw new Error("seed failed");

    const res = await updateOfferingForCreator(
      intruder.id,
      created.offering.id,
      { title: "Hijacked" },
      intruder.pubkey
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("not_found");
  });

  it("rejects a slug change that conflicts with another offering on the same user", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const a = await createOfferingForCreator(
      user.id,
      {
        slug: "a-slug",
        type: "code",
        title: "A",
        description: "A.",
        price_amount: 100,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    const b = await createOfferingForCreator(
      user.id,
      {
        slug: "b-slug",
        type: "code",
        title: "B",
        description: "B.",
        price_amount: 100,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    if (!a.ok || !b.ok) throw new Error("seed failed");

    const result = await updateOfferingForCreator(
      user.id,
      b.offering.id,
      { slug: "a-slug" },
      ACTOR
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("slug_taken");
  });
});

describe("admin/offerings/archiveOfferingForCreator", () => {
  it("sets archived_at and writes an audit row", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const created = await createOfferingForCreator(
      user.id,
      {
        slug: "to-archive",
        type: "download",
        title: "Soon-archived",
        description: "Goodbye.",
        price_amount: 500,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        download_url: "https://example.com/file.pdf",
      },
      ACTOR
    );
    if (!created.ok) throw new Error("seed failed");

    const result = await archiveOfferingForCreator(
      user.id,
      created.offering.id,
      ACTOR
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offering.archived_at).not.toBeNull();

    const archived = await listArchivedOfferings(user.id);
    expect(archived.length).toBe(1);
    expect(archived[0].id).toBe(created.offering.id);

    const auditRows = await testDb
      .select()
      .from(adminAuditLog)
      .where(eq(adminAuditLog.action, "archive"));
    expect(auditRows.length).toBe(1);
  });

  it("refuses to archive an already-archived offering", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const created = await createOfferingForCreator(
      user.id,
      {
        slug: "already",
        type: "code",
        title: "Already archived",
        description: "Already.",
        price_amount: 500,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    if (!created.ok) throw new Error("seed failed");
    await archiveOfferingForCreator(user.id, created.offering.id, ACTOR);

    const second = await archiveOfferingForCreator(
      user.id,
      created.offering.id,
      ACTOR
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("already_archived");
  });
});

describe("admin/offerings/list helpers", () => {
  it("listAllOfferings returns active rows for the user, newest-first", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const a = await createOfferingForCreator(
      user.id,
      {
        slug: "a",
        type: "code",
        title: "A",
        description: "A.",
        price_amount: 100,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    const b = await createOfferingForCreator(
      user.id,
      {
        slug: "b",
        type: "code",
        title: "B",
        description: "B.",
        price_amount: 100,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    if (!a.ok || !b.ok) throw new Error("seed failed");
    const rows = await listAllOfferings(user.id);
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(b.offering.id);
    expect(rows[1].id).toBe(a.offering.id);
  });

  it("listAllOfferings does not leak rows from other users", async () => {
    const a = await seedUser({
      pubkey: "a".repeat(64),
      slug: "merch-a",
    });
    const b = await seedUser({
      pubkey: "b".repeat(64),
      slug: "merch-b",
    });
    await createOfferingForCreator(
      a.id,
      {
        slug: "from-a",
        type: "code",
        title: "From A",
        description: "From A.",
        price_amount: 100,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      a.pubkey
    );
    await createOfferingForCreator(
      b.id,
      {
        slug: "from-b",
        type: "code",
        title: "From B",
        description: "From B.",
        price_amount: 100,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      b.pubkey
    );
    const seenByA = await listAllOfferings(a.id);
    expect(seenByA.length).toBe(1);
    expect(seenByA[0].slug).toBe("from-a");
  });

  it("getOfferingForCreator returns archived rows (panel needs them)", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const created = await createOfferingForCreator(
      user.id,
      {
        slug: "fetched",
        type: "code",
        title: "Fetched",
        description: "Fetched.",
        price_amount: 100,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    if (!created.ok) throw new Error("seed failed");
    await archiveOfferingForCreator(user.id, created.offering.id, ACTOR);

    const found = await getOfferingForCreator(user.id, "fetched");
    expect(found?.id).toBe(created.offering.id);
    expect(found?.archived_at).not.toBeNull();
  });
});

describe("admin/offerings/deleteOfferingForCreator", () => {
  it("permanently deletes an offering with no orders and writes a delete audit row", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const created = await createOfferingForCreator(
      user.id,
      {
        slug: "to-delete",
        type: "code",
        title: "Soon-deleted",
        description: "Disposable.",
        price_amount: 100,
        price_currency: "ars" as const,
        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    if (!created.ok) throw new Error("seed failed");

    const result = await deleteOfferingForCreator(
      user.id,
      created.offering.id,
      ACTOR
    );
    expect(result.ok).toBe(true);

    // The row is gone — not merely archived.
    expect((await listAllOfferings(user.id)).length).toBe(0);
    expect((await listArchivedOfferings(user.id)).length).toBe(0);

    const audit = await testDb
      .select()
      .from(adminAuditLog)
      .where(eq(adminAuditLog.action, "delete"));
    expect(audit.length).toBe(1);
  });

  it("refuses to delete an offering that has any order, with has_sales", async () => {
    const user = await seedUser({ pubkey: ACTOR });
    const created = await createOfferingForCreator(
      user.id,
      {
        slug: "sold",
        type: "code",
        title: "Has a sale",
        description: "Sold once.",
        price_amount: 100,
        price_currency: "ars" as const,
        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      ACTOR
    );
    if (!created.ok) throw new Error("seed failed");

    // Seed an order row directly (no need to fund through Wapu).
    await testDb.insert(orders).values({
      pubkey: null,
      offering_id: created.offering.id,
      user_id: user.id,
      amount_ars: 100,
      amount_sats: 0,
      rail: "wapu_ars",
    });

    const result = await deleteOfferingForCreator(
      user.id,
      created.offering.id,
      ACTOR
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("has_sales");

    // The offering is untouched (still active).
    expect((await listAllOfferings(user.id)).length).toBe(1);
  });

  it("returns not_found when the id belongs to another user (cross-tenant scoping)", async () => {
    const owner = await seedUser({ pubkey: "a".repeat(64), slug: "owner" });
    const intruder = await seedUser({
      pubkey: "b".repeat(64),
      slug: "intruder",
    });
    const created = await createOfferingForCreator(
      owner.id,
      {
        slug: "owned",
        type: "code",
        title: "Owned by someone else",
        description: "Not yours.",
        price_amount: 100,
        price_currency: "ars" as const,
        image_url: "https://example.com/cover.png",
        code_count: 5,
      },
      owner.pubkey
    );
    if (!created.ok) throw new Error("seed failed");

    const result = await deleteOfferingForCreator(
      intruder.id,
      created.offering.id,
      intruder.pubkey
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_found");
  });
});
