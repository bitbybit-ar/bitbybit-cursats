-- Add `users.transfer_speed` for the Wapu cbu_alias rail.
--
-- Sellers paying out to a CBU/alias pick how fast Wapu settles the
-- ARS deposit: 'fiat_transfer' (standard, lower fee) or
-- 'fast_fiat_transfer' (faster, higher fee). Only meaningful for the
-- cbu_alias rail; ignored for lightning_address payouts. Existing
-- rows default to 'fiat_transfer' so behavior is unchanged on
-- migration.
--
-- Hand-written, like the other migrations here — snapshots in
-- drizzle/meta/ are not consumed by the runtime migrator.

CREATE TYPE "transfer_speed" AS ENUM ('fiat_transfer', 'fast_fiat_transfer');
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "transfer_speed" "transfer_speed" NOT NULL DEFAULT 'fiat_transfer';
