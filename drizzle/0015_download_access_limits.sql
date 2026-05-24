-- Per-order download-access limit for `download`-type offerings.
--
-- A paid download order may fetch its file at most
-- MAX_DOWNLOADS_PER_ORDER times (lib/download-limits.ts), within
-- DOWNLOAD_ACCESS_WINDOW_DAYS of payment. The proxy at
-- /api/downloads/[orderId] bumps this counter atomically and refuses
-- once the cap is reached; the expiry window is computed from
-- `paid_at`, so it needs no column of its own.
--
-- Hand-written, like the other migrations here — snapshots in
-- drizzle/meta/ are not consumed by the runtime migrator.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "download_count" integer DEFAULT 0 NOT NULL;
