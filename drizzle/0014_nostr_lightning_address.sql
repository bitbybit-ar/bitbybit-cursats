-- Split the public Nostr Lightning Address from the payout one (ADR 0030).
--
-- `users.lightning_address` stays the *payout* destination for the
-- lightning_address method (LUD-21-validated at write time).
-- `nostr_lightning_address` is the *public* kind:0 lud16 edited on the
-- Profile tab and shown on the storefront zap button + QR — any LUD-16
-- address, no LUD-21 requirement. Backfill it from the existing
-- lightning_address so current sellers keep a working zap button; their
-- payout address stops being exposed publicly going forward.
--
-- Hand-written, like the other migrations here — snapshots in
-- drizzle/meta/ are not consumed by the runtime migrator.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nostr_lightning_address" varchar(128);
--> statement-breakpoint
UPDATE "users"
SET "nostr_lightning_address" = "lightning_address"
WHERE "lightning_address" IS NOT NULL
  AND "nostr_lightning_address" IS NULL;
