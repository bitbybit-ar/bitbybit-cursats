-- Offering tags (ADR 0024).
--
-- Adds a `tags text[]` column to offerings so creators can label
-- their courses for discovery and personalisation. Tags are
-- kebab-case lowercase ASCII, ≤32 chars per tag, ≤8 tags per
-- offering; those constraints are enforced by the Zod schema in
-- `lib/admin/offerings.ts`, not at the DB level — we keep the
-- column shape liberal so we don't have to migrate the table again
-- when the cap moves.
--
-- The GIN index powers two access patterns:
--   * `q = ANY(tags)` from the existing /explore search bar
--     (`listDiscoveryOfferingsPaged`).
--   * `tags && $signalTags` from the upcoming recommendations
--     module (PR 2 of the tags rollout).
--
-- Pure additive change. Default `'{}'` so existing offerings pick
-- up an empty tag set; no backfill needed.

ALTER TABLE "offerings"
  ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE INDEX "offerings_tags_gin_idx"
  ON "offerings" USING GIN ("tags");
