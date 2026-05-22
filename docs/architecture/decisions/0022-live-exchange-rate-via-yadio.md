# 0022. Live sats↔ARS exchange rate via Yadio

- **Date**: 2026-05-19
- **Status**: Superseded by [0027](0027-exchange-rate-from-wapu.md)
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Status | Superseded by ADR [0027](0027-exchange-rate-from-wapu.md): the rate is now derived from Wapu's `/exchange_rates`, not Yadio. The 5-min cache + last-good + static-fallback chain documented here is unchanged. | Source the storefront rate from the rail that actually settles the order, so a deposit sized from it funds the seller's payout. |
| 2026-05-19 | — | Initial version. | Record the live rate source and the fallback chain before sellers price real catalog against it. |

---

## Context

ADR [0019](0019-pricing-currency-picker.md) made the seller pick one
currency and the platform compute the other through a single seam:
`lib/exchange-rate.ts:getSatsPerArs()`. That ADR explicitly deferred
the real rate source — the body returned the `MOCK_SATS_PER_ARS = 4`
constant baked into `lib/wapu.ts`, with a one-line swap point waiting
for a real API.

Shipping with the constant was wrong on the storefront in the most
visible way possible: `4 sats = 1 ARS` implies a bitcoin price near
25M ARS, while the real Argentine crypto-market price was ~114M ARS
(≈ 0.88 sats per ARS). Every price the buyer saw was off by ~4.5×.
There is no public Wapu rate endpoint to read the settlement rate
from, so the storefront needs an independent source that tracks the
same market Wapu settles against.

Argentina has two materially different "bitcoin prices": the official
USD-derived rate and the parallel/crypto rate, roughly 2× apart. Wapu
settles at the crypto rate; a global feed quoting the official rate
would be wrong here even though it is "correct" globally.

## Decision

`getSatsPerArs()` fetches a live ARS-per-BTC quote from **Yadio**
(`https://api.yadio.io/convert/1/BTC/ARS`) and converts it to
sats-per-ARS (`100_000_000 / arsPerBtc`).

Yadio aggregates Argentine exchanges and reports the parallel/crypto
rate — the rate buyers and Wapu actually transact at. It is free, key
less, and returns a single unambiguous number (`rate` / `result` =
ARS per 1 BTC). The endpoint is read through
`lib/env.ts:getExchangeRateApiUrl()` and overridable via
`EXCHANGE_RATE_API_URL` so staging can point at a deterministic stub;
it is a public read-only URL, not a secret, so no `NEXT_PUBLIC_`
prefix and no throw-on-missing.

Resolution order, never throwing (price renderers are server
components that must not crash on an upstream blip):

1. Live Yadio rate, cached 5 minutes per process (unchanged from
   ADR 0019 — process-local, a stale rate across pods is fine).
2. The last rate successfully fetched, even past its 5-minute
   window — a slightly stale real rate beats a fabricated one. The
   TTL is re-armed so a sustained outage retries per window, not per
   request.
3. A static cold-start fallback (`110M ARS/BTC`), used only if the
   first fetch ever fails before any rate was cached, logged loudly.

The response is validated: ARS-per-BTC must be a finite number within
wide sanity bounds (1M–100B) to reject `0` / `NaN` / garbage without
second-guessing the market. Fetch uses an `AbortController` 6 s
timeout and `cache: "no-store"`, matching `lib/lightning.ts`.

Under `NODE_ENV === "test"` the network is never touched:
`getSatsPerArs()` returns a deterministic constant (kept at the
historical `4` so existing fixtures stay stable), with
`__setSatsPerArsForTests` / `__resetExchangeRateCacheForTests` seams
for tests that need a specific rate.

The Wapu **mock** client (`lib/wapu.ts`) now derives its sats from
the same `getSatsPerArs()` seam (snapshotted at
`createDirectPayment`, reused at funding) instead of its own
constant, so in dev/demo the buyer's "≈ X sats" matches what the mock
charges. In production Wapu does its own FX; the "≈" prefix and the
ARS-equivalent locked at order creation (`lib/orders.ts`) already
cover any divergence between the displayed estimate and Wapu's quote.

## Consequences

### Positive

- Storefront prices are correct to the market within ~5 minutes.
- Still a single seam: PriceTag, `lib/orders.ts`, discovery sort, and
  the Wapu mock all read one function.
- Graceful degradation: an outage shows a slightly stale real rate,
  not a crash and not a 4.5×-wrong number.
- Dev/demo display and mock funding agree again.

### Negative

- New runtime dependency on a third-party endpoint (Yadio). Mitigated
  by the cache + last-good + static fallback chain and the env
  override.
- The static cold-start fallback is a hardcoded fiat figure that
  drifts; it is the last resort only and its use is logged.

### Neutral

- First storefront request per process pays one ≤6 s fetch, then
  5-minute cached. Acceptable per ADR 0019's stale-rate trade-off.

## Alternatives considered

- **CoinGecko**: rejected — returns the official ARS rate, ~2× off
  the crypto rate in Argentina, so prices would be materially wrong
  for buyers even though the feed is globally "correct".
- **CriptoYa**: viable AR aggregator but a heavier per-exchange
  response requiring us to pick/median a reference; Yadio gives one
  authoritative number with no extra logic.
- **Wait for a Wapu rate endpoint**: rejected — it does not exist;
  ADR 0019 already shipped the seam waiting for *some* source and the
  mock constant was actively wrong on the live storefront.
- **Hardcode a periodically-updated constant**: rejected — drifts
  between deploys; the whole point is a live rate.

## References

- ADR [0019](0019-pricing-currency-picker.md) — the pricing-currency
  picker and the `getSatsPerArs()` seam this wires a source into.
- Yadio API: <https://api.yadio.io>
- `lib/exchange-rate.ts`, `lib/env.ts:getExchangeRateApiUrl`,
  `lib/wapu.ts` (mock funding).
