# 0031. Allow hard-delete of offerings that have no orders

- **Date**: 2026-05-24
- **Status**: Accepted
- **Deciders**: Analia (product), Cursats engineering
- **Last updated**: 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | — | Initial version. | Expose a permanent delete for offerings, scoped to those with no orders, alongside the existing archive. |

---

## Context

Until now the only way to retire an offering was **archive**
(`DELETE /api/my-courses/[id]` → set `archived_at`). That is a
reversible soft-delete: the row stays, the course drops off the
storefront, and sale history is preserved. The schema note on
`offerings` recorded that hard delete was deliberately **not** exposed
in v1 because `orders.offering_id` references `offerings.id` with no
cascade and we never want orphaned order rows.

In practice sellers accumulate throwaway courses — test listings,
typos, abandoned drafts — that they want gone for good, not merely
hidden in an "Archived" section. The My courses kebab menu now offers
both actions, so the product needs a real delete that does not
endanger sale history.

## Decision

**Expose a permanent delete that is refused while any order references
the offering.** A new route `DELETE /api/my-courses/[id]/delete` calls
`deleteOfferingForCreator`, which counts rows in `orders` for the
offering and:

- returns `409 has_sales` when one or more orders exist (the seller
  archives instead); otherwise
- deletes the `offerings` row and writes a `delete` audit entry.

The check covers **any** order row — paid or not — because the FK has
no cascade and an unpaid/pending order would still be orphaned. This
keeps the original "no orphaned references" guarantee intact while
giving sellers a true delete for courses that never sold.

The reversible archive remains the default and is the only way to
retire a course that has sales. The UI disables the Delete menu item
when the course shows sales and surfaces the 409 as a toast steering
the seller to Archive.

## Consequences

### Positive

- Sellers can permanently remove test/abandoned courses without
  cluttering an Archived list.
- Sale history is structurally protected: a course with any order can
  never be deleted, only archived.
- No schema migration: `orders.offering_id` is unchanged and the audit
  `action` column is a free-form `varchar`.

### Negative

- Two retire paths (archive vs. delete) to explain in the UI.
- A second DELETE surface under `/api/my-courses/[id]`
  (`…/[id]` archives, `…/[id]/delete` hard-deletes) — the verbs differ
  by sub-path, which a reader must learn.

### Neutral

- The "no hard delete in v1" posture from the `offerings` schema note
  is now amended (see the updated comment).

## Alternatives considered

- **Cascade-delete the orders too**: rejected — it destroys receipts
  and sale records, contradicting the in-app-receipt delivery model
  (ADR 0006) and the audit posture (ADR 0008).
- **Soft delete only (no hard delete)**: rejected — archive already
  exists; sellers explicitly asked to purge unsold test courses.
- **Allow delete and re-point orders to a tombstone offering**:
  rejected as over-engineered for v1; the no-orders guard is simpler
  and loses nothing.

## References

- Supersedes the "hard delete is not exposed in v1" clause of the
  `offerings` schema note (`lib/db/schema.ts`).
- Related: ADR
  [0014](0014-marketplace-open-to-all-logged-in-users.md) (offerings
  get full CRUD), ADR [0009](0009-offerings-and-settings-in-database.md)
  (catalog in Postgres).
