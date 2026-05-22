# Settlement rails

> **Status:** Active
> **Last updated:** 2026-05-21

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — explain *why* the dual-rail design exists, what each rail trades off, and where the design line is drawn (no third rail). |

---

## Table of Contents

1. [Why two rails](#why-two-rails)
2. [Rail A — Wapu (sats → ARS to CBU)](#rail-a--wapu-sats--ars-to-cbu)
3. [Rail B — Lightning Address (direct sats)](#rail-b--lightning-address-direct-sats)
4. [The single dispatch point](#the-single-dispatch-point)
5. [LUD-21 — the LN-rail entry requirement](#lud-21--the-ln-rail-entry-requirement)
6. [Exchange rate (display only)](#exchange-rate-display-only)
7. [What we deliberately do not do](#what-we-deliberately-do-not-do)

---

## Why two rails

The first version of Cursats had one rail: Wapu only, sats in
and ARS out to a CBU. That worked for the piano teacher who
needs pesos for rent, but excluded the tango professor whose
students already pay him in sats and who wants the sats to land
in *his* wallet, not in a converter. Pushing him through Wapu
meant a forced sats→ARS→sats round-trip; he would have just
walked.

ADR
[0015-sats-settlement-rail](../architecture/decisions/0015-sats-settlement-rail.md)
added the second rail (Lightning Address via LNURL-pay) and
fixed the rail count at exactly two. The two together cover the
seller audience the project actually exists for: people who want
pesos, and people who want sats. Adding a third rail requires a
superseding ADR.

For the buyer-facing flow of each rail, see
[checkout-flow](./checkout-flow.md).

## Rail A — Wapu (sats → ARS to CBU)

**Who picks it.** Sellers who want their daily revenue in pesos —
because that is the currency they pay rent, taxes, suppliers,
and their own teachers in. Bitcoin is not their savings vehicle;
it is the rail that lets a student abroad pay them at all.

**Where the sats go.** Into Wapu's flow. Wapu converts at market
rate (the same Argentine parallel/crypto rate Cursats quotes
against, see "Exchange rate" below), then pushes ARS to the
seller's CBU or alias the same business day.

**Source of truth for "paid".** The Wapu webhook delivery at
`/api/wapu/webhook`, signature-verified before any state change.

**Custody.** Cursats does not custody. Wapu's direct-payment
endpoint puts the payout destination on the same call that mints
the invoice, so the ARS ends up at the seller's bank, not at
Wapu's house account and not at Cursats's.

**Limitations.** Argentine bank account required. Wapu fees and
spread apply (documented by Wapu, not by Cursats — the seller
sees them on the same dashboard they configured the alias on).

Decisions in ADRs
[0002](../architecture/decisions/0002-settlement-via-wapu.md) (Wapu
choice) and
[0015](../architecture/decisions/0015-sats-settlement-rail.md)
(rail-count clause, superseding part of 0002).

## Rail B — Lightning Address (direct sats)

**Who picks it.** Sellers who already live in sats — their
Lightning wallet is their primary unit of account, or at least
their primary inflow rail. They want no converter, no FX spread,
and no third-party between the buyer's pay-button and their
balance.

**Where the sats go.** Directly into the seller's wallet via
their LNURL provider. Cursats fetches a BOLT11 from the
seller's provider on order creation; the buyer pays it; the
sats land in the seller's wallet just like any other payment to
that Lightning Address.

**Source of truth for "paid".** The LNURL provider's LUD-21
`verify` URL. Cursats polls it from the server side until it
returns `{ settled: true }`. See
[LUD-21 — the LN-rail entry requirement](#lud-21--the-ln-rail-entry-requirement)
below.

**Custody.** Cursats does not custody. The sats never touch a
Cursats-controlled wallet; they go straight to the seller's
LNURL provider, which routes them to whatever wallet sits behind
the address.

**Limitations.** Requires an LNURL provider with LUD-21
support. Most modern wallets (Alby Hub, Strike, Blink, LNbits)
advertise it; some lighter-weight custodial addresses still do
not. Cursats refuses to save a Lightning Address that fails the
LUD-21 probe at Settings save time.

## The single dispatch point

The system has exactly one place where rail dispatch happens:
order creation reads `users.payout_method` (`cbu_alias` or
`lightning_address`) and stamps `orders.rail` (`wapu_ars` or
`direct_lightning`) accordingly. From that moment on:

- The Wapu webhook handler short-circuits anything where
  `rail !== 'wapu_ars'`.
- The LN verify poller short-circuits anything where
  `rail !== 'direct_lightning'`.
- The receipt page renders identically for both rails.

```text
                ┌──────────────────────┐
order creation  │ users.payout_method  │  read once per order
                │ cbu_alias │ lightning_address
                └──────────┬───────────┘
                           │
                           ▼
                    orders.rail        immutable thereafter
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
     rail = wapu_ars            rail = direct_lightning
            │                             │
   Wapu invoice + payout              LNURL invoice
   Webhook is source of truth         Verify URL is source of truth
```

Changing the seller's payout method later affects *future* orders
only; in-flight orders keep the rail they were stamped with.

## LUD-21 — the LN-rail entry requirement

LUD-21 is the LNURL spec extension that adds a `verify` URL to
the pay callback response. Without it, a merchant has no
server-side way to confirm a Lightning Address payment — the
buyer pays, the sats land in the seller's wallet, and the
merchant is left guessing whether it happened.

That is unacceptable for a checkout. So Cursats refuses to
accept any Lightning Address whose provider does not advertise
LUD-21.

The check happens at Settings save time, not at checkout time:

1. The seller pastes a Lightning Address in `/settings`.
2. The PATCH handler resolves the LNURL-pay metadata.
3. If the response carries no `verify` URL field, the save is
   rejected with a clear error.
4. If it does, the handler mints a **1-sat probe invoice** (no
   funds change hands meaningfully), polls the verify URL once
   to confirm the contract works end-to-end, and only then
   writes the address to the user row.

This means a seller can never publish an offering against a
broken LN provider; the failure mode is "you cannot save the
address," not "your buyers see a stuck checkout."

The probe and re-sign live with the settings flow; see
[settings-and-payouts](./settings-and-payouts.md).

## Exchange rate (display only)

Cursats does not settle in ARS — the seller's bank does, via
Wapu. But the storefront must *display* sats prices in pesos
(and vice versa) so a piano teacher pricing a class at
"15,000 ARS" sees a sensible sats equivalent, and a buyer pricing
in pesos sees a sensible sats QR.

The rate source is **Yadio**, the Argentine parallel/crypto rate
Wapu itself settles against. It is:

- **Live.** A keyless HTTPS endpoint, polled on the server.
- **Cached for 5 minutes.** Repeated reads inside the window hit
  the cache, not Yadio.
- **Backstopped by last-good.** A Yadio outage falls through to
  the most recent successful read.
- **Backstopped by a static fallback.** If the last-good cache is
  also missing (cold start during an outage), a hard-coded
  conservative rate prevents the storefront from displaying
  nonsense.

The single seam is `lib/exchange-rate.ts:getSatsPerArs()`. No
caller talks to Yadio directly. The base URL is overridable via
`EXCHANGE_RATE_API_URL` for testing.

Decision in ADR
[0022-live-exchange-rate-via-yadio](../architecture/decisions/0022-live-exchange-rate-via-yadio.md).

## What we deliberately do not do

- **No third rail.** Stripe-style cards, USDT, MercadoPago — all
  out of scope. Adding one needs a superseding ADR (see
  [0015](../architecture/decisions/0015-sats-settlement-rail.md)).
- **No platform-side wallet.** Cursats never holds sats on behalf
  of either party. The closest the platform comes to touching the
  buyer's sats is *creating the invoice* — and even then the
  invoice is minted by Wapu or by the seller's LNURL provider,
  not by Cursats.
- **No platform spread.** Cursats does not pad the sats↔ARS
  conversion. Whatever Wapu pays at, that is what the seller
  gets.
- **No retroactive rail switching.** A seller who changes payout
  method does so for future orders only. In-flight orders keep
  their original rail.
- **No "smart routing" between rails.** A seller has one rail at
  a time. Switching is intentional, not algorithmic.
