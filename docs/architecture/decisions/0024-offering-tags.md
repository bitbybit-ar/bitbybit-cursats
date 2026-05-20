# 0024. Add tags to offerings

- **Date**: 2026-05-20
- **Status**: Accepted
- **Deciders**: analia
- **Last updated**: 2026-05-20

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-20 | — | Initial version. | Tags are the foundation for the suggested-for-you rail and improved search; the schema and validation shape should be pinned before downstream PRs build on it. |

---

## Context

Two pieces of the next product iteration depend on a per-offering
labelling signal that does not exist today:

1. **Suggested-for-you on `/purchases` and `/explore`.** The
   recommendations module needs to rank offerings by tag overlap with
   the buyer's recent paid orders (with seller history as a secondary
   signal). Without tags, the only available signal is the seller —
   too coarse to be useful when a buyer has bought from one teacher
   and we want to recommend a similar course by a different one.

2. **Discovery search by topic.** Today the `/explore` search bar
   ILIKEs the title, description, and seller display name. A buyer
   looking for *yoga* finds courses with "yoga" in the title or body
   but misses courses whose title is "Tu primera clase de hatha" —
   the seller knows the category, the buyer knows the category, but
   the text doesn't overlap.

We considered building these features without a structured signal —
e.g. mining tags from the description with an LLM, or letting
sellers stuff a comma-separated string into a single text field —
but both make the personalisation surface fragile and the search
behaviour unpredictable. A first-class column is the cheap, durable
fix.

## Decision

Add a `tags text[] NOT NULL DEFAULT '{}'` column to the `offerings`
table, with a GIN index for containment / overlap queries. Tags are
constrained kebab-case ASCII, ≤32 characters per tag, ≤8 tags per
offering. The constraints are enforced by the Zod schema in
`lib/admin/offerings.ts` (`TagSchema`, `TagsSchema`,
`MAX_TAGS_PER_OFFERING = 8`) and a `normalizeTags` helper that
trims, lowercases, strips diacritics, dedupes, and applies the cap
on the write path as a defence-in-depth pass behind validation.

The form (`components/courses/offering-form`) gains a chip-input
field below the description. Enter or comma commits a chip;
backspace on an empty draft removes the most-recent chip; an "×" on
each chip removes it individually. The input disables itself once
the seller hits the cap.

Tags surface on `OfferingCard` as up to three pill chips below the
description, each linking to `/explore?q=<tag>`. The existing
`/explore` search bar gains a fourth OR clause:
`$q = ANY(offerings.tags)`. We use exact match (not ILIKE) on
tags because the kebab-case shape makes partial matches noisy —
`"art"` would otherwise match `"martial-arts"`. The GIN index keeps
`= ANY` cheap regardless of corpus size.

## Consequences

### Positive

- Personalisation has a clean signal to rank against; the
  recommendations module can ship without a heuristic that mines
  free text.
- Buyers can pivot from a recognised course to its peers with one
  click on a tag chip.
- The search bar absorbs tags transparently — sellers don't have to
  cram every synonym into the title or description.
- Sellers' tag vocabularies emerge organically; we can promote a
  curated taxonomy later without re-modelling the schema.

### Negative

- We do not block obscene, misleading, or off-topic tags up front.
  In v1 we lean on the small marketplace size + the audit log; if
  abuse appears we will add a moderation surface for the platform
  admin to remove tags.
- Per-tag SEO landing pages (e.g. `/explore/tag/yoga`) are not yet
  routed; `?q=` reuses the existing search infrastructure but is
  not as discoverable to crawlers. Revisit if the marketplace
  grows enough to make that worthwhile.
- Sellers see one more required-feeling field on the create-course
  form. The field is marked optional, but well-intentioned sellers
  will spend more time on it than expected. Acceptable cost for
  the discovery upside.

### Neutral

- Existing rows pick up an empty array on migration; pre-launch
  the catalog is small enough that we are not running a backfill.
- The `tags` column's NOT NULL constraint trades a small write-path
  cost (one default) for cleaner read sites — every consumer can
  assume `offering.tags` is an array without null-checking.

## Alternatives considered

- **Comma-separated string in a `text` column.** Simpler schema
  but pushes parsing onto every read site, makes the GIN index
  unavailable, and forces the recommendations query into a LIKE
  pattern across the entire corpus. Rejected.
- **A separate `offering_tags` join table.** Cleaner per relational
  modelling, but the recommendations query becomes a multi-join
  and the form has to manage tag rows alongside the offering row.
  At ≤8 tags per offering, an array column is the right
  cost-complexity trade-off.
- **LLM-derived tags from the description.** Removes seller effort
  but commits us to opaque categorisation the seller cannot
  override; also costs an inference call per write. Rejected for
  v1; revisit as an "auto-suggest" affordance on the form once we
  have enough data to fine-tune.
- **Free-text tags with no shape constraint.** Lets sellers write
  "Yoga", "yoga", "YOGA " — every variant lives forever, making the
  signal worthless. Rejected; the kebab-case + lowercase + max-32
  shape is the minimum to keep the corpus coherent.

## References

- Migration: `drizzle/0009_offering_tags.sql`.
- Schema: `lib/db/schema.ts` (`offerings.tags` + `offerings_tags_gin_idx`).
- Validation: `lib/admin/offerings.ts` (`TagSchema`, `TagsSchema`,
  `MAX_TAGS_PER_OFFERING`, `normalizeTags`).
- Search extension: `lib/offerings.ts:listDiscoveryOfferingsPaged`.
- UI: `components/courses/offering-form/`,
  `components/catalog/offering-card/`.
