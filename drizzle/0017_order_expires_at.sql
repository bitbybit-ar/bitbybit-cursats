-- When the buyer's BOLT11 invoice expires.
--
-- Copied at funding time from the upstream invoice's own expiry
-- (`deposit.expires_at` / `invoice.expires_at`, ~10 min out). The status
-- poller (/api/orders/[orderId]) and the /purchases & /orders read paths
-- fail a still-`pending` order once now() passes this — there is no
-- expiry cron. Issue #57.
--
-- Nullable: the order row is inserted before the rail-specific funder
-- runs, and a paid/failed/refunded row carries no meaningful invoice
-- expiry. The backfill seeds only `pending` rows so pre-existing terminal
-- rows keep NULL instead of a fictitious expiry; read paths treat NULL as
-- "do not fail".
--
-- Hand-written, like the other migrations here — snapshots in
-- drizzle/meta/ are not consumed by the runtime migrator.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;

UPDATE "orders"
SET "expires_at" = "created_at" + interval '10 minutes'
WHERE "status" = 'pending' AND "expires_at" IS NULL;
