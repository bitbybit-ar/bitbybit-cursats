import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";

// Precedence: MIGRATE_ENV_FILE → .env.local → .env. Dotenv's default
// is to NOT override already-set variables, so the first file that
// defines DATABASE_URL wins. Set MIGRATE_ENV_FILE=.env.test to run
// migrations against the test database (see `npm run test:db:migrate`).
const envFile = process.env.MIGRATE_ENV_FILE;
if (envFile) {
  config({ path: envFile });
}
config({ path: ".env.local" });
config({ path: ".env" });

const MIGRATIONS_FOLDER = "./drizzle";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  assertMonotonicMigrationTimestamps();
  const client = neon(databaseUrl);
  const db = drizzle(client);
  await baselineIfNeeded(db);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await assertJournalIsComplete(db);
  console.log("Migrations applied");
}

// Drizzle's migrator only applies migrations whose folderMillis is
// STRICTLY GREATER than the latest already-applied row's created_at.
// If a migration file lands with a folderMillis earlier than an
// already-applied migration (e.g. because the author's clock was
// behind, or two migrations were generated in parallel), it falls
// below the watermark and gets silently skipped forever. The workflow
// reports success while the schema drifts.
//
// Fail loudly at the start of every run instead. Fix is to edit
// drizzle/meta/_journal.json and bump the offending entry's `when` so
// the sequence is strictly increasing in tag order.
function assertMonotonicMigrationTimestamps(): void {
  const migrations = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  for (let i = 1; i < migrations.length; i++) {
    const prev = migrations[i - 1];
    const curr = migrations[i];
    if (curr.folderMillis <= prev.folderMillis) {
      throw new Error(
        `Migration timestamps are not strictly increasing in _journal.json: ` +
          `entry ${i} has when=${curr.folderMillis} but entry ${i - 1} has when=${prev.folderMillis}. ` +
          `Drizzle would silently skip the out-of-order migration. ` +
          `Fix: edit drizzle/meta/_journal.json and bump the "when" value of the offending entry so it exceeds its predecessor.`
      );
    }
  }
}

// Second line of defense: after migrate() returns, verify every
// migration file's hash is present in the DB journal. Catches silent
// skips from any cause (watermark drift, manual journal edits,
// cross-DB URL mismatches). Without this, a misconfigured run can
// exit 0 with the schema out of sync.
async function assertJournalIsComplete(db: NeonHttpDatabase): Promise<void> {
  const migrations = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  const { rows } = await db.execute<{ hash: string }>(
    sql`SELECT hash FROM drizzle.__drizzle_migrations`
  );
  const applied = new Set(rows.map((r) => r.hash));
  const missing = migrations.filter((m) => !applied.has(m.hash));
  if (missing.length > 0) {
    const details = missing
      .map((m) => `  - when=${m.folderMillis} hash=${m.hash}`)
      .join("\n");
    throw new Error(
      `After migrate(), ${missing.length} migration(s) are missing from the DB journal:\n${details}\n` +
        `The migrator did not apply them (likely silent skip). Investigate before shipping.`
    );
  }
}

// If the schema already exists (e.g. created by a prior `drizzle-kit
// push` or manual setup) but drizzle's bookkeeping table is empty,
// the migrator would try to re-run 0000 and crash on "relation
// already exists". Baseline the journal once so drizzle treats those
// migrations as already applied.
//
// This ONLY runs on the very first migrate call against a
// pre-existing schema. Once the journal has any rows, we trust
// drizzle's migrator to apply any new migration files.
async function baselineIfNeeded(db: NeonHttpDatabase): Promise<void> {
  const schemaExists = await hasOfferingsTable(db);
  if (!schemaExists) {
    console.log("Baseline: no existing schema, skipping");
    return;
  }

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const { rows: existing } = await db.execute<{
    hash: string;
    created_at: string | number | null;
  }>(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`);

  const migrations = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  if (existing.length === 0) {
    for (const m of migrations) {
      await db.execute(
        sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${m.hash}, ${m.folderMillis})`
      );
    }
    console.log(
      `Baseline: first run, baselined ${migrations.length} migration(s) into empty journal`
    );
    return;
  }

  let repaired = 0;
  for (const m of migrations) {
    const { rows } = await db.execute<{ id: number }>(sql`
      UPDATE drizzle.__drizzle_migrations
      SET created_at = ${m.folderMillis}
      WHERE hash = ${m.hash}
        AND (created_at IS NULL OR created_at < ${m.folderMillis})
      RETURNING id
    `);
    repaired += rows.length;
  }

  console.log(
    `Baseline: journal has ${existing.length} row(s); repaired ${repaired} stale created_at value(s); new migrations will be applied by the migrator`
  );
}

async function hasOfferingsTable(db: NeonHttpDatabase): Promise<boolean> {
  const { rows } = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'offerings'
    ) AS "exists"
  `);
  return Boolean(rows[0]?.exists);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
