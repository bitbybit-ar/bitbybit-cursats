# 0026. Price currency follows the payout rail

- **Date**: 2026-05-22
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Decision | Add the 10 000 ARS net-payout floor. | Wapu rejects fiat withdrawals under 10 000 ARS, so a course whose net falls below it could never be paid out. |
| 2026-05-22 | — | Initial version. | Tie the course-pricing currency to the seller's payout rail and surface the Wapu fee at create time. |

---

## Context

ADR [0019](0019-pricing-currency-picker.md) gave sellers a free
per-course choice of pricing currency (ARS or sats), independent of
how they get paid. With the Wapu rail rebuilt as a USDT-ledger,
fee-bearing flow (ADR
[0025](0025-wapu-poll-driven-two-leg-rail.md)), that free choice
creates two problems:

1. **It mismatches how sellers think.** A seller who cashes out to a
   CBU/alias thinks in pesos; a seller who receives sats to a
   Lightning Address thinks in sats. Letting a peso-seller price in
   sats means their actual ARS payout floats with the BTC/ARS rate
   between listing and sale — they can't name a price and know what
   they'll get.
2. **The Wapu fee was invisible.** On the `cbu_alias` rail the seller
   bears Wapu's withdrawal fee (the platform is curSATS, not a PSP).
   Nothing showed them how much they'd actually net.

## Decision

**The course-pricing currency is derived from the seller's payout
rail, not chosen per course:**

- `cbu_alias` (Wapu → ARS) → price in **ARS**.
- `lightning_address` (sats direct) → price in **sats**.

The create-course form no longer renders a currency picker; it shows
a read-only note explaining which currency applies and why. The
server enforces the rule: `POST /api/my-courses` rejects a
`price_currency` that doesn't match `expectedPriceCurrency(user)`
with `price_currency_mismatch` rather than re-interpreting the amount
in the wrong unit.

**The seller bears the Wapu fee, shown live at create time.** On the
ARS rail, as the seller types a price the form calls
`POST /api/payout-quote`, which runs Wapu's `tentative-amount`
against the seller's `transfer_speed` and returns the fee (converted
to ARS) and the net (`gross − fee`). The form displays
"Estimated Wapu fee ~X · You receive ≈ Y" — an estimate, since the
final rate is set at sale time. The settlement path uses the same
`quoteSellerPayout` helper so the actual withdrawal pays the seller
the net, not the gross.

**The net payout must clear Wapu's 10 000 ARS withdrawal floor.** Wapu
rejects a fiat withdrawal under 10 000 ARS (observed live: `400
{"error":"Minimum amount is $10000 ARS"}`). Because the seller bears
the fee, the withdrawal pays the *net*, so the constraint is on the net,
not the gross. `WAPU_MIN_NET_ARS` (`lib/wapu-limits.ts`, shared by the
form and the API) is the floor; `POST`/`PATCH /api/my-courses` reject an
ARS course whose quoted net falls below it with
`price_below_wapu_minimum`, and the create-course form blocks submission
and shows the same message. If the quote is briefly unavailable the API
falls back to flooring the gross price, so an outage degrades to a
coarser guard rather than letting an unpayable course through.

## Consequences

### Positive

- Sellers price in the unit they think in and, on the ARS rail, see
  what they'll net before publishing.
- One source of truth (`quoteSellerPayout`) for both the create-time
  estimate and the settlement-time withdrawal.
- No way to publish a peso-priced course on a sats wallet (or vice
  versa); the server rejects the mismatch.

### Negative

- Removes seller flexibility: a peso-seller cannot list a sats price
  for a sats-savvy audience without switching their payout rail.
  Judged not a real v1 use case.
- The net shown at create time is an estimate; the seller's actual
  pesos move with the rate between listing and sale. The copy says
  so explicitly.

### Neutral

- Edit mode keeps the offering's stored `price_currency` (the amount
  is denominated in it); a seller who later flips their rail does not
  retroactively re-price existing offerings.

## Alternatives considered

- **Keep the free picker, just add the fee estimate.** Rejected: it
  leaves the peso-seller-prices-in-sats footgun and the confusing
  floating payout.
- **Always price in sats (brand-led).** Rejected: a seller cashing
  out to ARS thinks in pesos and wants a predictable peso figure;
  forcing sats hides that behind a moving estimate.
- **Let the buyer pick the currency.** Out of scope; the seller sets
  the price, the buyer pays the sats equivalent.

## References

- ADR [0019](0019-pricing-currency-picker.md) — the free per-course
  picker, superseded by this ADR.
- ADR [0025](0025-wapu-poll-driven-two-leg-rail.md) — the Wapu
  two-leg rail and the seller-bears-the-fee posture this builds on.
- ADR [0015](0015-sats-settlement-rail.md) — the rail split that
  `payout_method` encodes.
