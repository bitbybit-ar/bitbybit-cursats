// The integration files carry an explicit `@vitest-environment node`
// docblock. It is redundant now that `node` is the global default
// (the suite has no React component tests), but kept as a defensive
// marker: @neondatabase/serverless prints a browser-SQL warning if it
// ever detects `window`, so these files must never run under a DOM env.
import { config } from "dotenv";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

// Load .env.test before anything else.
config({ path: resolve(__dirname, "../../.env.test") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL not set in .env.test. Copy .env.test.example to .env.test and point it at a Neon test branch."
  );
}

const sqlClient = neon(databaseUrl);
export const testDb = drizzle(sqlClient, { schema });

/**
 * Truncate every table in the public schema. Call in beforeEach to
 * guarantee a clean slate. RESTART IDENTITY resets sequences;
 * CASCADE handles any FK links from later schema additions without
 * requiring this list to be kept in dependency order.
 */
export async function cleanDb() {
  await testDb.execute(
    sql`TRUNCATE TABLE admin_audit_log, orders, offerings, users RESTART IDENTITY CASCADE`
  );
}

/**
 * Insert a user row with optional overrides. Tests that need an
 * offering or order start by calling this so the FK in
 * `offerings.user_id` / `orders.user_id` always points at a real
 * row. ADRs 0012, 0016.
 */
export async function seedUser(
  overrides: Partial<{
    pubkey: string;
    slug: string;
    display_name: string;
    alias: string | null;
    cbu: string | null;
    lightning_address: string | null;
    payout_method: "cbu_alias" | "lightning_address";
    active: boolean;
  }> = {}
) {
  const pubkey = overrides.pubkey ?? "f".repeat(64);
  const slug = overrides.slug ?? "demo";
  const [row] = await testDb
    .insert(schema.users)
    .values({
      pubkey,
      slug,
      display_name: overrides.display_name ?? "Demo User",
      alias: overrides.alias ?? "demo.test.alias",
      cbu: overrides.cbu ?? null,
      lightning_address: overrides.lightning_address ?? null,
      payout_method: overrides.payout_method ?? "cbu_alias",
      active: overrides.active ?? true,
    })
    .returning();
  return row;
}
