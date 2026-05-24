-- Add NWC as a second sats-rail input method (ADR 0029).
--
-- `lightning_nwc` joins the payout_method enum alongside cbu_alias and
-- lightning_address; it rides the same direct_lightning order rail as
-- lightning_address (no new order rail). `users.nwc_uri` holds the
-- seller's nostr+walletconnect:// connection, stored
-- AES-256-GCM-encrypted by the application layer (lib/crypto.ts) —
-- never plaintext. Null unless the seller picks the NWC method.
-- Existing rows are unaffected.
--
-- Hand-written, like the other migrations here — snapshots in
-- drizzle/meta/ are not consumed by the runtime migrator.

ALTER TYPE "payout_method" ADD VALUE IF NOT EXISTS 'lightning_nwc';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nwc_uri" text;
