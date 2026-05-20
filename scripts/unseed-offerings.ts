import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import {
  users,
  offerings,
  orders,
  adminAuditLog,
  notifications,
} from "@/lib/db/schema";

// Same dotenv precedence as scripts/migrate.ts and seed-offerings.ts
// so a single MIGRATE_ENV_FILE/.env.local/.env file drives all three.
const envFile = process.env.MIGRATE_ENV_FILE;
if (envFile) config({ path: envFile });
config({ path: ".env.local" });
config({ path: ".env" });

// Mirrors the seed script's well-known pubkey for the "Profe Demo"
// row. Anything attached to this pubkey came from `scripts/seed-
// offerings.ts` and is safe to remove.
const SEED_USER_PUBKEY =
  "0000000000000000000000000000000000000000000000000000000000000000";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  const [seedUser] = await db
    .select({ id: users.id, slug: users.slug })
    .from(users)
    .where(eq(users.pubkey, SEED_USER_PUBKEY))
    .limit(1);

  if (!seedUser) {
    console.log("Seed user not present — nothing to remove.");
    return;
  }

  // Collect the offering IDs first so we can clean up any orders
  // that reference them. Orders FK both `offering_id` and `user_id`
  // without ON DELETE CASCADE, so we have to delete them by hand
  // before dropping the user row.
  const offeringRows = await db
    .select({ id: offerings.id, slug: offerings.slug })
    .from(offerings)
    .where(eq(offerings.user_id, seedUser.id));

  const offeringIds = offeringRows.map((r) => r.id);

  let removedOrders = 0;
  if (offeringIds.length > 0) {
    const deletedByOffering = await db
      .delete(orders)
      .where(inArray(orders.offering_id, offeringIds))
      .returning({ id: orders.id });
    removedOrders += deletedByOffering.length;
  }
  const deletedBySeller = await db
    .delete(orders)
    .where(eq(orders.user_id, seedUser.id))
    .returning({ id: orders.id });
  removedOrders += deletedBySeller.length;

  // Admin audit rows FK users.id without cascade and the column is
  // nullable. Drop the seed rows entirely rather than leaving
  // orphaned NULL-user audit entries hanging around.
  const removedAudit = await db
    .delete(adminAuditLog)
    .where(eq(adminAuditLog.user_id, seedUser.id))
    .returning({ id: adminAuditLog.id });

  // Notifications carry recipient_pubkey (no FK), so we match the
  // seed pubkey directly — both `order.paid` to the buyer and
  // `sale.received` to the seller flow through this table.
  const removedNotifs = await db
    .delete(notifications)
    .where(eq(notifications.recipient_pubkey, SEED_USER_PUBKEY))
    .returning({ id: notifications.id });

  // Deleting the user cascades to offerings (FK has ON DELETE
  // CASCADE), so we don't need to delete offerings explicitly.
  await db.delete(users).where(eq(users.id, seedUser.id));

  console.log(
    `Removed seed user "${seedUser.slug}": ` +
      `${offeringRows.length} offering(s), ${removedOrders} order(s), ` +
      `${removedAudit.length} audit row(s), ${removedNotifs.length} notification(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
