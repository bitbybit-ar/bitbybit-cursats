# 0027. Source the sats↔ARS exchange rate from Wapu

- **Date**: 2026-05-22
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | — | Initial version. | Replace the Yadio rate source (ADR 0022) with Wapu's own rate now that Wapu's API is integrated. |

---

## Context

ADR [0022](0022-live-exchange-rate-via-yadio.md) sourced the
storefront's sats↔ARS rate from Yadio because, at the time, Wapu had
no readable rate endpoint — the storefront could only *approximate*
the rate Wapu would settle at. With the Wapu rebuild (ADR
[0025](0025-wapu-poll-driven-two-leg-rail.md)) we now call Wapu's API
directly, and `GET /exchange_rates` returns the very rates Wapu
transacts at:

```json
{ "rates": [
  { "pair": "USDT/ARS", "buy": 1439.45, "sell": 1510.11 },
  { "pair": "BTC/USD",  "buy": 76815.64, "sell": 81880.80 }
] }
```

Approximating with a third party (Yadio) when the settling party
publishes its own rate is needless drift: a deposit sized from the
Yadio rate may credit slightly more or less USDT than the seller's
payout needs.

## Decision

Derive `getSatsPerArs()` in `lib/exchange-rate.ts` from Wapu's
`/exchange_rates` instead of Yadio:

```
ARS per BTC = (USDT/ARS buy) × (BTC/USD buy)      # USDT treated as USD
sats per ARS = 100_000_000 / (ARS per BTC)
```

We use the **buy** side of both pairs deliberately. Observed against
staging, Wapu credits a Lightning deposit at the BTC/USD *buy* rate
and debits a fiat withdrawal at the USDT/ARS *buy* rate. Sizing the
buyer's deposit from `sats = ars × sats_per_ars` with this rate makes
the credited USDT line up with the USDT the seller's net ARS payout
costs, so the platform float nets to ~0 (see ADR
[0026](0026-price-currency-follows-payout-rail.md) for the fee math).

Everything else from ADR 0022 is unchanged: the 5-minute per-process
cache, the last-good-rate degrade, the static cold-start fallback,
the sanity bounds on ARS/BTC, and the deterministic test
short-circuit. Only the fetch URL and the response parsing changed.
The request reuses `WAPU_PAY_APU_HOST` + `WAPU_API_KEY`; the standalone
`EXCHANGE_RATE_API_URL` env var is removed.

## Consequences

### Positive

- The displayed estimate and the deposit sizing use the same rate the
  rail settles at — less float drift, fewer "insufficient funds"
  surprises on withdrawal.
- One fewer third-party dependency (Yadio) and one fewer env var.

### Negative

- The storefront rate now depends on Wapu being reachable. Mitigated
  by the unchanged last-good + static-fallback chain, so a transient
  Wapu blip degrades gracefully rather than blanking prices.

### Neutral

- `lib/exchange-rate.ts` reads `WAPU_*` env directly rather than going
  through the Wapu client, to keep it free of the client's
  import graph and to preserve the existing `fetch`-stub unit tests.

## Alternatives considered

- **Keep Yadio.** Rejected: approximating a rate the settling party
  publishes is pointless drift now that we can read it.
- **Route through `getWapuClient()`.** Rejected for now: it would
  couple the rate module to the client singleton's lifecycle and
  complicate the offline unit tests for no real gain; a direct
  `fetch` with the shared env is simpler.

## References

- ADR [0022](0022-live-exchange-rate-via-yadio.md) — the Yadio source,
  superseded by this ADR.
- ADR [0025](0025-wapu-poll-driven-two-leg-rail.md) — the Wapu API
  integration this builds on.
- ADR [0026](0026-price-currency-follows-payout-rail.md) — the
  seller-bears-the-fee math the buy-side rate choice serves.
