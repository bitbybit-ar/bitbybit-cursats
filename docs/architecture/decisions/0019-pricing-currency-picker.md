# 0019. Pricing currency picker on the offering form

- **Date**: 2026-05-13
- **Status**: Superseded by [0026](0026-price-currency-follows-payout-rail.md)
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Status | Superseded by ADR [0026](0026-price-currency-follows-payout-rail.md): the free per-course currency picker is replaced by a currency derived from the seller's payout rail. | A peso-seller pricing in sats had an unpredictable ARS payout, and the Wapu fee was invisible at create time. |
| 2026-05-19 | Decision (Rate source) | The deferred "one-place swap" landed: `getSatsPerArs()` now fetches a live rate. The "body currently returns `MOCK_SATS_PER_ARS`" text below is historical — see ADR [0022](0022-live-exchange-rate-via-yadio.md). | The mock constant (4 sats/ARS, ~4.5× off the real rate) was shipping wrong prices on the live storefront. |
| 2026-05-13 | — | Initial version. | Pin the new pricing model before sellers start filling the catalog under it, and so the destructive `price_sats` drop is documented next to the migration that performs it. |

---

## Context

ADR [0009](0009-offerings-and-settings-in-database.md) shipped
offerings with a dual price field:

- `price_ars: integer` — required, the canonical ARS price.
- `price_sats: integer` — optional, a pinned satoshi override for
  sellers on the direct-Lightning rail who wanted to lock the sats
  the buyer paid regardless of FX drift.

Two things broke that model in practice:

1. **Sellers don't think in two currencies.** Educators pricing in
   ARS never set the sats pin; educators paid out in sats (ADR
   [0015](0015-sats-settlement-rail.md)) never wanted to price in
   ARS at all but were forced to type one and let the platform
   compute sats from a placeholder rate. The "optional pin" field
   was unused in 100% of seed and demo data.

2. **The display layer fell back to a hardcoded rate.** PriceTag,
   `lib/orders.ts`, and `lib/wapu.ts` each carried their own
   `FALLBACK_SATS_PER_ARS = 4` constant. There was no single
   source of truth, and the storefront could quote a sats figure
   that diverged from what Wapu actually charged at funding time
   (in production, where Wapu performs the FX). The "optional pin"
   was a workaround for that drift, not a feature anyone asked
   for.

The hackathon brief explicitly calls for a clean buyer flow:
a course priced X ARS should show the live sats equivalent, and
vice versa, **without** asking the seller to maintain two figures.

## Decision

Sellers pick **one** currency on the offering form and enter
**one** price. The other currency is always computed at render
time against the live Wapu exchange rate.

Schema change (drizzle migration
[`0007_pricing_currency.sql`](../../../drizzle/0007_pricing_currency.sql)):

- Drop `offerings.price_sats`.
- Rename `offerings.price_ars` → `offerings.price_amount`.
- Add `offerings.price_currency` enum (`'ars' | 'sats'`).
- Existing rows backfill to `price_currency = 'ars'` because the
  pre-migration model was ARS-canonical.

Display:

- `components/catalog/price-tag/index.tsx` becomes an async server
  component. It receives `{ priceAmount, priceCurrency }` and
  computes the other side via the new `lib/exchange-rate.ts`
  helper. The seller's chosen side renders exact; the computed
  side carries a "≈" prefix so buyers can tell at a glance.

Rate source:

- `lib/exchange-rate.ts:getSatsPerArs()` is the single seam every
  reader (PriceTag, orders, discovery sort) goes through.
- The body currently returns the same `MOCK_SATS_PER_ARS` constant
  Wapu's MockClient applies at funding time. When Wapu ships a
  public rate endpoint, the body swaps to a `fetch` and the rest
  of the codebase doesn't change.
- A 5-minute process-local cache lives inside the helper so the
  storefront does not hammer Wapu on every page view.

Order creation:

- `lib/orders.ts` locks an ARS-equivalent at the moment of
  `createOrder` via `convertPrice(price_amount, currency, 'ars')`.
  The Wapu rail receives that locked ARS upstream; the
  direct-Lightning rail records it on the order row for the
  buyer's receipt. A rate move mid-funding cannot re-price an
  in-flight order.

Discovery sort:

- The `price_asc` / `price_desc` sorts use a SQL `CASE` to
  normalize to ARS at query time. Result ordering is consistent
  regardless of which currency individual offerings chose. The
  rate snapshot for one query is locked so pagination cursors
  don't reshuffle on rate moves between pages.

Type changes on edit are forbidden because the same form would
otherwise need to handle currency conversion of an existing price
in the seller's old currency — a separate UX problem we are not
solving here. The offering form's type radio is disabled in edit
mode; sellers who actually need to change type archive the
offering and create a new one.

## Consequences

**Positive:**

- One price field, one currency field. No more silently unused
  `price_sats` column.
- Storefront and Wapu always agree on the rate, because they read
  through the same `getSatsPerArs()` helper.
- Adding a real rate source is a one-place change.
- Sellers paid out in sats can price in sats. The display
  computes ARS; buyers used to pesos still see a familiar number.

**Negative / accepted trade-offs:**

- **The migration drops a column.** Restoring `price_sats` from
  scratch is impossible without a backup. We accept this because
  the column was unused in every offering today; the backfill
  inspects `price_ars` and stamps `price_currency = 'ars'`.
- **Discovery sort precision.** Sorting "100 ARS" and "25 sats"
  (mock rate `1 ARS = 4 sats`) puts them at the same position.
  Acceptable for a hackathon catalog; the SQL `CASE` is the only
  cross-currency sort that doesn't require a denormalised cached
  ARS column.
- **Stale rate display.** A buyer who lingers on the page for >5
  minutes may see a slightly stale conversion. The buyer doesn't
  pay against that figure (Wapu re-quotes at funding); the
  "≈" prefix already communicates approximation.
- **Type radio locked on edit.** Sellers who picked the wrong
  type at create time have to archive and re-create. Acceptable
  blast radius; the alternative is a multi-page flow we don't
  need.

**Out of scope:**

- A real Wapu rate endpoint integration — the helper has a
  one-line swap point waiting for the API to ship.
- Per-listing currency conversion preferences for the buyer
  (e.g. "show me everything in sats"). The storefront shows both
  figures on every card; a global preference is a v2 question.

## Supersedes

- The pricing half of ADR
  [0009](0009-offerings-and-settings-in-database.md). The
  storage decision (Postgres rows, not YAML) stands; the
  particular columns it specified for offerings are replaced by
  this ADR.
