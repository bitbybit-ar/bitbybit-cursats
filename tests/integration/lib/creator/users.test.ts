// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import { testDb, cleanDb } from "../../setup";
import { users } from "@/lib/db/schema";
import { ensureUserForPubkey } from "@/lib/creator/users";

const PUBKEY_A = "a".repeat(64);

beforeAll(async () => {
  const { rows } = await testDb.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS "exists"
  `);
  if (!rows[0]?.exists) {
    throw new Error(
      "Test database is missing the 'users' table. Run `npm run test:db:migrate` first."
    );
  }
});

beforeEach(async () => {
  await cleanDb();
});

// Locale seeding at account creation (ADR 0021). The sign-in locale
// seeds a brand-new row's preferred language; a returning user keeps
// whatever they saved in /settings because ensureUserForPubkey
// short-circuits on existing rows.
describe("ensureUserForPubkey — locale seeding (ADR 0021)", () => {
  it("seeds locale from the sign-in locale on creation", async () => {
    const row = await ensureUserForPubkey(PUBKEY_A, { locale: "en" });
    expect(row.locale).toBe("en");

    // And it is actually persisted, not just returned.
    const [persisted] = await testDb
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.pubkey, PUBKEY_A));
    expect(persisted.locale).toBe("en");
  });

  it("falls back to the column default ('es') when no locale is given", async () => {
    const row = await ensureUserForPubkey(PUBKEY_A, { display_name: "Demo" });
    expect(row.locale).toBe("es");
  });

  it("never overwrites a returning user's stored preference", async () => {
    // First sign-in in English seeds "en".
    const created = await ensureUserForPubkey(PUBKEY_A, { locale: "en" });
    expect(created.locale).toBe("en");

    // A later sign-in from the Spanish URL must NOT clobber it — the
    // row already exists, so the stored preference wins.
    const returning = await ensureUserForPubkey(PUBKEY_A, { locale: "es" });
    expect(returning.locale).toBe("en");
    expect(returning.id).toBe(created.id);
  });
});
