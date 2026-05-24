# Settlement rails

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Rail B, Single dispatch point, LUD-21 entry | Documented NWC (NIP-47) as the second input method of the sats rail alongside the LUD-21 Lightning Address: renamed Rail B to "Direct sats", added the NWC sub-method (`make_invoice`/`lookup_invoice`, encrypted URI, relay/poll-cadence trade-offs), updated the dispatch enum + diagram to include `lightning_nwc`, and scoped the LUD-21 entry requirement to the Lightning-Address sub-method. Corrected the stale "Strike advertises LUD-21" example. | ADR 0029 — most wallets the audience uses fail LUD-21, so NWC is the alternative way onto the `direct_lightning` rail. |
| 2026-05-24 | Rail A — Wapu, By design | Corrected the custody claims: the `wapu_ars` rail credits the buyer's payment as USDT to a Cursats-controlled Wapu wallet (leg 1) before a separate withdrawal settles ARS to the seller (leg 2), so Cursats holds the funds in transit and Wapu + Cursats are intermediaries on that rail. Scoped the "non-custodial" By-design bullet to the sats rail. | The old text claimed Wapu's "direct-payment" put ARS at the seller's bank "not at Cursats's" on the same call — the pre-ADR-0025 model; under the two-leg flow it is false. |
| 2026-05-23 | By design | Reframed the scope section (formerly "What we deliberately do not do") as "By design", leading each point with the strength (non-custodial, no platform spread, exactly two rails). | The "what we don't do" framing read as incompleteness, but each item is a deliberate design strength — the section should sell it, not apologize for it. |
| 2026-05-23 | Single dispatch point | Fixed the dispatch diagram's `wapu_ars` leaf to read "Deposit poll is source of truth" instead of the leftover "Webhook is source of truth". | The diagram still showed the pre-ADR-0025 webhook model; the rail is poll-driven. |
| 2026-05-22 | Wapu rail, Single dispatch point | Source-of-truth for "paid" is now the Wapu deposit poll (no webhook); the rail short-circuit references the deposit poller. | The Wapu rebuild (ADR 0025) made the rail poll-driven. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — explain *why* the dual-rail design exists, what each rail trades off, and where the design line is drawn (no third rail). |

---

## Table of Contents

1. [Why two rails](#why-two-rails)
2. [Rail A — Wapu (sats → ARS to CBU)](#rail-a--wapu-sats--ars-to-cbu)
3. [Rail B — Direct sats (Lightning Address or NWC)](#rail-b--direct-sats-lightning-address-or-nwc)
4. [The single dispatch point](#the-single-dispatch-point)
5. [Sats-rail entry: LUD-21 or NWC](#sats-rail-entry-lud-21-or-nwc)
6. [Exchange rate (display only)](#exchange-rate-display-only)
7. [By design](#by-design)

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

The sats rail later grew a **second input method** — NWC (Nostr
Wallet Connect, NIP-47) — alongside the Lightning Address, because
most wallets the Argentine audience uses don't expose the LUD-21
`verify` URL the address method needs (ADR
[0029](../architecture/decisions/0029-nwc-sats-rail-input-method.md)).
Both methods land on the one `direct_lightning` rail: NWC is an
input method, **not** a third rail. The rail count is still two.

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

**Source of truth for "paid".** Polling the Wapu deposit
transaction (`GET /transactions/{id}`) from
`/api/orders/[orderId]` until it reads `Completed` — no webhook.

**Custody.** This rail is custodial in transit. The buyer's
Lightning payment is a Wapu deposit that credits **USDT to a
Cursats-controlled Wapu wallet** (leg 1); a separate withdrawal
then settles ARS to the seller's CBU/alias (leg 2), and can lag
the deposit by up to a couple of hours. Until that withdrawal
clears, the funds sit in the Cursats Wapu account — so on this
rail Wapu and Cursats act as intermediaries. See ADR
[0025](../architecture/decisions/0025-wapu-poll-driven-two-leg-rail.md)
for the two-leg flow.

**Limitations.** Argentine bank account required. Wapu fees and
spread apply (documented by Wapu, not by Cursats — the seller
sees them on the same dashboard they configured the alias on).

Decisions in ADRs
[0002](../architecture/decisions/0002-settlement-via-wapu.md) (Wapu
choice) and
[0015](../architecture/decisions/0015-sats-settlement-rail.md)
(rail-count clause, superseding part of 0002).

## Rail B — Direct sats (Lightning Address or NWC)

**Who picks it.** Sellers who already live in sats — their
Lightning wallet is their primary unit of account, or at least
their primary inflow rail. They want no converter, no FX spread,
and no third-party between the buyer's pay-button and their
balance.

**Custody.** Cursats does not custody on this rail, with either
input method. The sats never touch a Cursats-controlled wallet;
the invoice is minted by the seller's own wallet (or its provider)
and the sats land straight there.

The rail accepts the seller's wallet via one of **two input
methods**, chosen in `/settings`. Both stamp the same
`direct_lightning` rail; the order also records which sub-method it
was created under, so its confirmation path is fixed at creation.

### Method 1 — Lightning Address (LUD-21)

**Where the sats go.** Directly into the seller's wallet via their
LNURL provider. Cursats fetches a BOLT11 from the seller's provider
on order creation; the buyer pays it; the sats land in the seller's
wallet just like any other payment to that Lightning Address.

**Source of truth for "paid".** The LNURL provider's LUD-21
`verify` URL. Cursats polls it from the server side until it
returns `{ settled: true }`. See
[Sats-rail entry: LUD-21 or NWC](#sats-rail-entry-lud-21-or-nwc)
below.

**Limitations.** Requires an LNURL provider with LUD-21 support.
Alby, Blink, Coinos, and LNbits advertise it; many popular wallets
— Strike, ZBD, Primal — do not. Cursats refuses to save a Lightning
Address that fails the LUD-21 probe at Settings save time; sellers
on those wallets use NWC instead.

### Method 2 — NWC (Nostr Wallet Connect, NIP-47)

**Where the sats go.** Directly into the seller's wallet, same as
the address method. Cursats holds an authenticated NWC channel to
the wallet over a Nostr relay and calls `make_invoice` to mint the
buyer's BOLT11; the sats land in the seller's wallet.

**Source of truth for "paid".** `lookup_invoice` over the same NWC
channel, polled server-side until the invoice reads settled. This
is the same verification role LUD-21's `verify` URL plays for the
address method, so it drops into the existing
`/api/orders/[orderId]` poll loop.

**The connection is a stored credential.** Unlike a public
Lightning Address, the `nostr+walletconnect://` URI is a
spending-capable secret. It is stored **AES-256-GCM-encrypted** at
rest (`lib/crypto.ts`, key `ENCRYPTION_KEY`), decrypted only in
server routes, and never returned to the client — the settings API
exposes a "connected" flag, not the URI. Cursats only ever calls
`make_invoice` and `lookup_invoice`, so the seller is asked to
issue a **receive-only** connection (no `pay_invoice`).

**Limitations.** Requires a wallet that speaks NIP-47 (Primal,
Alby, Coinos, Zeus, LNbits). It also adds a relay dependency: if
the seller's NWC relay is unreachable, checkout cannot mint and the
poller cannot confirm. Each poll opens a fresh relay connection (no
persistent connection in a serverless route), so NWC orders poll at
a slower cadence than LUD-21 orders. The client is `@getalby/sdk`'s
`NWCClient`, wrapped in `lib/nwc.ts` to mirror the `lib/lightning.ts`
interface. Decision in ADR
[0029](../architecture/decisions/0029-nwc-sats-rail-input-method.md).

## The single dispatch point

The system has exactly one place where rail dispatch happens:
order creation reads `users.payout_method` (`cbu_alias`,
`lightning_address`, or `lightning_nwc`) and stamps `orders.rail`
(`wapu_ars` or `direct_lightning`) accordingly — both sats methods
map to `direct_lightning`. The order also records which sats
sub-method it used, so its confirmation path is fixed at creation.
From that moment on:

- The Wapu deposit poller short-circuits anything where
  `rail !== 'wapu_ars'`.
- The direct-lightning poller short-circuits anything where
  `rail !== 'direct_lightning'`, then confirms via the LUD-21
  `verify` URL or NWC `lookup_invoice` per the stamped sub-method.
- The receipt page renders identically for both rails.

```text
                ┌──────────────────────────────────────────┐
order creation  │ users.payout_method                      │  read once per order
                │ cbu_alias │ lightning_address │ lightning_nwc
                └──────────┬───────────────────────────────┘
                           │
                           ▼
                    orders.rail        immutable thereafter
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
     rail = wapu_ars            rail = direct_lightning
            │                             │
   Wapu invoice + payout         LNURL invoice (LUD-21) OR NWC make_invoice
   Deposit poll is source        Verify URL OR NWC lookup_invoice
   of truth                      is source of truth (per sub-method)
```

Changing the seller's payout method later affects *future* orders
only; in-flight orders keep the rail and sub-method they were
stamped with.

## Sats-rail entry: LUD-21 or NWC

Either way onto the sats rail, Cursats needs a server-side way to
confirm the buyer's payment — without one, the buyer pays, the sats
land in the seller's wallet, and the merchant is left guessing
whether it happened. Each input method has its own entry check,
both run at Settings save time (not at checkout), so a seller can
never publish an offering against a wallet Cursats can't confirm.

**Lightning Address — LUD-21 required.** LUD-21 is the LNURL spec
extension that adds a `verify` URL to the pay-callback response.
Cursats refuses to accept any Lightning Address whose provider does
not advertise it. The check:

1. The seller pastes a Lightning Address in `/settings`.
2. The PATCH handler resolves the LNURL-pay metadata.
3. If the response carries no `verify` URL field, the save is
   rejected with a clear error.
4. If it does, the handler mints a **1-sat probe invoice** (no
   funds change hands meaningfully), polls the verify URL once
   to confirm the contract works end-to-end, and only then
   writes the address to the user row.

**NWC — connection probe.** Setting `nwc_uri` is validated by
probing the connection: a `get_info` capability check plus a tiny
`make_invoice` + `lookup_invoice` round-trip. A connection that
cannot receive, exposes only spend capabilities, or whose relay is
unreachable is rejected at save time. ADR 0029 supersedes the
absolute "LN settlement requires LUD-21" posture of ADR 0015:
LUD-21 is still required for the Lightning-Address method, but it is
no longer the only way onto the sats rail.

Both checks mean the failure mode is "you cannot save the
destination," not "your buyers see a stuck checkout." The probes
and the re-sign live with the settings flow; see
[settings-and-payouts](./settings-and-payouts.md).

## Exchange rate (display only)

Cursats does not settle in ARS — the seller's bank does, via
Wapu. But the storefront must *display* sats prices in pesos
(and vice versa) so a piano teacher pricing a class at
"15,000 ARS" sees a sensible sats equivalent, and a buyer pricing
in pesos sees a sensible sats QR.

The rate source is **Wapu's `/exchange_rates`** — the very rates
Wapu settles against (buy USDT/ARS × buy BTC/USD). It is:

- **Live.** Read from the Wapu API on the server, reusing
  `WAPU_PAY_APU_HOST` + `WAPU_API_KEY` (no separate service).
- **Cached for 5 minutes.** Repeated reads inside the window hit
  the cache, not Wapu.
- **Backstopped by last-good.** A Wapu blip falls through to
  the most recent successful read.
- **Backstopped by a static fallback.** If the last-good cache is
  also missing (cold start during an outage), a hard-coded
  conservative rate prevents the storefront from displaying
  nonsense.

The single seam is `lib/exchange-rate.ts:getSatsPerArs()`. No
caller talks to the rate API directly. Decision in ADR
[0027](../architecture/decisions/0027-exchange-rate-from-wapu.md),
superseding the Yadio source of ADR 0022.

Decision in ADR
[0022-live-exchange-rate-via-yadio](../architecture/decisions/0022-live-exchange-rate-via-yadio.md).

## By design

- **Exactly two rails.** Cards, USDT, and MercadoPago are out of
  scope by choice; adding a rail takes a superseding ADR (see
  [0015](../architecture/decisions/0015-sats-settlement-rail.md)).
- **Non-custodial on the sats rail.** On `direct_lightning`, sats
  land straight in the seller's wallet via their LNURL provider or
  NWC connection — Cursats never holds them. The `wapu_ars` rail is
  **custodial in transit**: the buyer's payment lands as USDT in a
  Cursats-controlled Wapu wallet and is settled to the seller's
  bank in a second leg (see Rail A and ADR 0025), so on that rail
  Wapu and Cursats are intermediaries until payout clears.
- **Transparent conversion.** Cursats takes no spread on the
  sats↔ARS conversion — whatever Wapu pays at is what the seller
  gets.
- **Stable per-order rail.** Changing the payout method affects
  *future* orders only; in-flight orders keep the rail they were
  stamped with.
- **One rail at a time.** A seller picks a rail explicitly;
  switching is intentional, not algorithmic — there is no
  cross-rail "smart routing."
