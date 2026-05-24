# 0029. Add NWC as a second input method for the sats rail

- **Date**: 2026-05-23
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-23

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-23 | — | Initial version. | Most wallets the audience uses fail LUD-21; add NWC so they can still receive sats on the direct-lightning rail. |

---

## Context

ADR [0015](0015-sats-settlement-rail.md) added the sats rail
(`direct_lightning`): the seller pastes a Lightning Address, checkout
mints a BOLT11 against its LNURL-pay callback, and the order poller
confirms payment through the provider's **LUD-21** `verify` URL. That
ADR made LUD-21 a hard requirement and asserted "almost every modern
provider supports it," and it explicitly **rejected** NWC as the rail
mechanism ("NWC requires the merchant to expose receive permissions
and an encrypted secret on Cursats's server, plus a working relay").

That assertion turned out to be wrong. While fixing issue #36 (Primal
listed as a recommended provider but failing LUD-21) we probed each
suggested wallet the exact way the app validates them — the `verify`
field on the LNURL-pay **callback** response (`lib/lightning.ts`):

| Wallet | LUD-21 `verify`? |
|---|---|
| Alby (getalby.com) | yes |
| Blink (blink.sv) | yes |
| Coinos (coinos.io) | yes |
| Wallet of Satoshi | **no** |
| Strike | **no** |
| ZBD | **no** |
| Primal | **no** |
| Rizful | **no** |

The wallets the Argentine audience actually uses — Wallet of Satoshi,
Primal, Strike — are exactly the ones with no `verify` URL, so a seller
pasting one is rejected with `lnurl_no_lud21`. The sats rail is
effectively unusable for most sellers, and the LUD-21 requirement,
not provider laziness, is the cause.

**NWC (Nostr Wallet Connect, NIP-47) closes the gap.** It gives us an
authenticated channel to the seller's wallet over a Nostr relay with
two commands that replace the entire LUD-21 dance:

- `make_invoice` — the seller's wallet mints the buyer's BOLT11 at
  checkout (sats land directly in the seller's wallet, same
  non-custodial property as the LN-address sub-method).
- `lookup_invoice` — we confirm settlement server-side. This is
  exactly the verification LUD-21 gave us, so it drops straight into
  the existing `/api/orders/[orderId]` poll loop.

NWC covers the wallets LUD-21 misses: Primal, Alby, Coinos, Zeus, and
LNbits all speak NIP-47. The sister project **habits** already runs
NWC in production (`@getalby/sdk` for the client, AES-256-GCM at rest
in `lib/crypto.ts`), so the pattern and its security posture are
proven in-house. The friction ADR 0015 rejected (an encrypted secret,
a relay dependency) is now a price worth paying, because the
alternative is a rail most sellers cannot use.

## Decision

**NWC is a second *input method* of the existing sats rail, offered
alongside the LUD-21 Lightning Address — not a new rail.** A seller on
the sats rail chooses, in `/settings`, either a Lightning Address
(must support LUD-21) or an NWC connection. The order `rail` enum
stays `wapu_ars | direct_lightning`; there is still no third rail.

Schema (drizzle migration `0013_*`):

- `users.payout_method` gains the value **`lightning_nwc`** alongside
  `cbu_alias` and `lightning_address`. Both `lightning_address` and
  `lightning_nwc` map to the `direct_lightning` order rail; `cbu_alias`
  maps to `wapu_ars`. Pricing currency follows the same split as ADR
  [0026](0026-price-currency-follows-payout-rail.md): both sats
  sub-methods price in **sats**.
- `users.nwc_uri` (text, nullable, **server-only, encrypted at rest**)
  holds the full `nostr+walletconnect://` URI. Meaningful only when
  `payout_method = 'lightning_nwc'`, mirroring how `lightning_address`
  is meaningful only on its method and `cbu`/`alias` only on theirs.
- The order records which sats sub-method it was created under, so an
  in-flight order's verification path is fixed at creation and a later
  settings flip does not retarget it — the same "stamped at creation"
  posture `rail` already has.

Security:

- The NWC URI is a payment credential (a wallet secret key + relay).
  It is stored **AES-256-GCM-encrypted** via a ported `lib/crypto.ts`
  (the habits implementation: `node:crypto`, key from `ENCRYPTION_KEY`,
  packed `IV + ciphertext + authTag` as base64). It is **never**
  returned to the client; the settings API exposes only a "connected"
  flag, never the URI. This is the first secret Cursats encrypts at
  rest, so `ENCRYPTION_KEY` (32-byte base64) is a new required env var
  in production.
- We use only `make_invoice` and `lookup_invoice`. The settings UI
  tells the seller to issue a connection **without** `pay_invoice`
  permission; the platform never needs to spend from their wallet.
- The client is `@getalby/sdk`'s `NWCClient` (the de-facto NIP-47
  client, already the org's choice in habits). A `lib/nwc.ts` wrapper
  mirrors the `lib/lightning.ts` `LightningClient` interface
  (`mintInvoice` ↔ `make_invoice`, `pollVerify` ↔ `lookup_invoice`)
  so checkout and the poller stay uniform across both sats
  sub-methods.

Validation: setting or changing `nwc_uri` is a payment-destination
change, so it requires the NIP-07 re-sign ADR
[0014](0014-marketplace-open-to-all-logged-in-users.md) already
mandates. The settings PATCH validates the connection by probing
`get_info` (capability check) and minting a tiny `make_invoice` +
`lookup_invoice`, rejecting a connection that cannot receive or that
exposes spend-only capabilities.

This **supersedes the absolute "LN settlement requires LUD-21"
posture** of ADR 0015: LUD-21 is still required for the
`lightning_address` sub-method, but it is no longer the only way onto
the sats rail.

## Consequences

### Positive

- The sats rail becomes usable for the wallets the audience actually
  has (Primal, Alby, Coinos, Zeus, LNbits) instead of only the three
  that expose LUD-21.
- `lookup_invoice` is a stronger verification channel than a public
  `verify` URL: it is authenticated and does not depend on the
  provider implementing an optional public-endpoint spec.
- Reuses a proven in-house pattern (habits `crypto.ts` + `@getalby/sdk`),
  so the security review surface is familiar.

### Negative

- Cursats now stores a wallet credential at rest. That introduces an
  encryption dependency, key management (`ENCRYPTION_KEY`), and a
  higher-stakes failure mode than a pasted LN address. Mitigated by
  AES-256-GCM at rest, never exposing the URI, and asking for a
  receive-only connection.
- Two invoicing paths and two verification paths on the sats rail to
  maintain. Mitigated by the shared `LightningClient`-shaped wrapper
  and shared `markOrderPaid` effects.
- A relay dependency: if the seller's NWC relay is unreachable,
  checkout cannot mint and the order poller cannot confirm. Same
  single-vendor shape as the LN-address provider risk in ADR 0015.
  Each poll also opens a fresh relay connection (no persistent
  connection in a serverless route), so the buyer's checkout page
  polls NWC orders at a slower cadence (`poll_after_ms` hint from
  `/api/orders/[orderId]`) and self-schedules the next poll only after
  the current one resolves, to keep connection churn bounded.

### Neutral

- Still one method per seller, set in settings; no per-offering or
  buyer-side choice. The buyer UI is unchanged — one BOLT11, one QR,
  one poll endpoint.
- NWC pricing follows the sats split (price in sats), so the
  create-course form and `expectedPriceCurrency` treat `lightning_nwc`
  exactly like `lightning_address`.

## Alternatives considered

- **Replace the Lightning Address sub-method with NWC entirely.**
  Rejected: it would drop wallets that support LUD-21 but not NWC
  (e.g. some Blink/Galoy setups) and force a migration of existing
  `lightning_address` sellers. Keeping both maximizes coverage for the
  cost of one extra code path.
- **A separate `wallets` table (the habits shape).** Rejected: Cursats
  keeps all payout configuration on the `users` row, one nullable
  field per method (`cbu`, `alias`, `lightning_address`). `nwc_uri`
  as another such field is the established pattern; a side table would
  be an inconsistency for a single per-user value.
- **Store the NWC URI in plaintext (like `lightning_address`).**
  Rejected: an LN address is public; an NWC URI is a spending-capable
  secret. It must be encrypted at rest.
- **Custodial / LNbits-only recommendation.** Rejected: it does not
  help a seller who already has Primal or Wallet of Satoshi, which is
  the actual gap.

## References

- ADR [0015](0015-sats-settlement-rail.md) — the sats rail and its
  LUD-21 requirement; this ADR adds NWC as a second input method and
  reverses 0015's rejection of NWC.
- ADR [0026](0026-price-currency-follows-payout-rail.md) — pricing
  currency follows the payout rail; `lightning_nwc` prices in sats.
- ADR [0014](0014-marketplace-open-to-all-logged-in-users.md) — the
  NIP-07 re-sign on payment-destination changes, which covers setting
  `nwc_uri`.
- Sister project `bitbybit-habits` — production NWC integration
  (`lib/crypto.ts` AES-256-GCM, `@getalby/sdk` `NWCClient`).
- NIP-47 (Nostr Wallet Connect):
  <https://github.com/nostr-protocol/nips/blob/master/47.md>.
- LUD-21 spec: <https://github.com/lnurl/luds/blob/luds/21.md>.
- Issue #36 — Primal fails LUD-21; the probe that surfaced the gap.
