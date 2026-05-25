-- Per-course redeem/contact link for `code`-type offerings.
--
-- The page or contact channel where a buyer presents their redemption
-- code (a web page, WhatsApp/Telegram link, mailto:, or tel:). The
-- create-course form requires it for code offerings; the receipt's
-- "Contact the teacher" card links to it. Nullable so pre-existing
-- code offerings keep working until edited. For download offerings it
-- stays null. Issue #60.
--
-- Hand-written, like the other migrations here — snapshots in
-- drizzle/meta/ are not consumed by the runtime migrator.

ALTER TABLE "offerings" ADD COLUMN IF NOT EXISTS "redeem_url" text;
