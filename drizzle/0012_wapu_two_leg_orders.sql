-- Rework the orders table for the two-leg Wapu flow.
--
-- Wapu is a USDT-ledger wallet with no webhooks: the buyer funds a
-- Lightning deposit (leg 1) that credits USDT, then we open a fiat
-- withdrawal to the seller's CBU/alias (leg 2). Both legs are polled
-- via GET /transactions/{id}. This supersedes the old single-leg
-- direct-payment columns.
--
-- Renames preserve any existing rows:
--   wapu_tentative_uuid  -> wapu_deposit_tx_id   (leg 1 tx id)
--   wapu_settlement_ref  -> wapu_withdrawal_tx_id (leg 2 tx id)
--
-- Adds the seller-payout-leg bookkeeping: payout_status, the
-- settlement timestamp, the USDT credited by the deposit (for
-- reconciliation), and a snapshot of the seller's transfer speed.
--
-- Hand-written, like the other migrations here — snapshots in
-- drizzle/meta/ are not consumed by the runtime migrator.

CREATE TYPE "payout_status" AS ENUM ('pending', 'released', 'failed');
--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "wapu_tentative_uuid" TO "wapu_deposit_tx_id";
--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "wapu_settlement_ref" TO "wapu_withdrawal_tx_id";
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payout_status" "payout_status";
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payout_released_at" timestamp;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "amount_usdt" numeric(18, 8);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transfer_speed" "transfer_speed";
