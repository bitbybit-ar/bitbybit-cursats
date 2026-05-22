# 0015. Add a sats settlement rail via Lightning Address

- **Date**: 2026-05-09
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Consequences | The note that "the auto-renewal flow works on both rails via buyer-side NWC" is moot — autorenewal is deferred (ADR 0020) and the NWC env was removed as dead code. The dual-rail decision and the LUD-21 requirement are unchanged. | NWC/autorenewal code no longer exists; the doc must not present it as current. |
| 2026-05-09 | — | Initial version. | Pin the second settlement rail and the LUD-21 requirement before merchants start using it. |

---

## Context

ADR [0002](0002-settlement-via-wapu.md) hardcoded settlement to Wapu in
v1: every order's sats arrived in Wapu's pool and Wapu pushed ARS to
the merchant's CBU/alias. That decision pinned the **settlement** rail
even though **checkout** was always Lightning.

A real fraction of educators want to keep their pay in sats — they
already self-custody and they would rather not convert. Asking them to
go through ARS-only settlement to use Cursats is a discovery loss the
hackathon brief did not anticipate. ADR 0002's "neutral" section
already left the door open: "the decision can be revisited in a later
ADR."

The straightforward way to pay a merchant in sats is to mint a BOLT11
invoice directly against a destination they control — a Lightning
Address (LNURL-pay) is the lowest-overhead option:

- The merchant pastes one string. No NWC URL to copy, no encrypted
  secret to store, no per-deployment LSP credential.
- Modern providers (Wallet of Satoshi, Strike, Alby Hub, LNbits, ZBD,
  Primal, and most of the Argentine self-custodial wallets) implement
  it.
- Verification is a single GET via **LUD-21**'s `verify` URL — the
  same shape as Wapu's webhook substituted for a poll. We do not
  need an outgoing connection to the merchant's wallet.

The cost is a hard dependency on **LUD-21**: the merchant's provider
must return a `verify` URL on its LNURL-pay callback. Without that we
have no server-side way to confirm the BOLT11 was paid (the merchant
has not given us NWC credentials, and we are not about to ask). Almost
every modern provider supports it; the few that do not (some legacy
custodians) we deliberately exclude in v1.

## Decision

A merchant chooses one settlement rail in their settings page, set
once and applied to all of their offerings:

- **`cbu_alias`** (default) — Wapu mints the BOLT11, the buyer pays
  it, Wapu converts to ARS and pushes pesos to the merchant's CBU or
  alias. Existing flow, unchanged.
- **`lightning_address`** — Cursats's checkout API resolves the
  merchant's LN address via `/.well-known/lnurlp/<local-part>`, mints
  the BOLT11 against the LNURL-pay callback, persists the LUD-21
  `verify` URL on the order row, and the buyer pays the merchant's
  wallet directly. Sats land in the merchant's wallet. No Wapu in
  the path. The order status endpoint polls the `verify` URL and
  flips the order to `paid` on `settled: true`.

Schema additions (drizzle migration `0003_sats_settlement_rail.sql`):

- `merchants.payout_method enum('cbu_alias','lightning_address')`,
  default `cbu_alias`.
- `merchants.lightning_address text` (nullable).
- `orders.rail enum('wapu_ars','direct_lightning')`, default
  `wapu_ars`. Stamped at order creation from the merchant's then-
  current `payout_method`. Flipping the rail later does not
  retroactively change the receipt of an in-flight order.
- `orders.lnurl_verify_url text` (nullable; only set on
  `direct_lightning`).

LUD-21 is a hard requirement on the sats rail. The settings PATCH
mints a 1-sat probe invoice when a merchant sets/changes their LN
address; if the upstream callback does not include a `verify` URL,
we reject the address with a friendly error listing supported
providers.

The Wapu webhook (`POST /api/wapu/webhook`) refuses any delivery for
an order whose `rail !== 'wapu_ars'` and returns 404 with no body —
defense in depth against a misrouted event flipping a sats-rail order.

## Consequences

### Positive

- Merchants who self-custody can sell on Cursats without converting
  to ARS.
- The platform never holds funds on either rail. The sats rail is
  an even lighter integration than Wapu (no API key, no shared
  account, no LSP).
- The buyer UI is unchanged: both rails render the same BOLT11 QR
  and poll the same status endpoint.
- The auto-renewal flow (ADR 0005, buyer-side NWC) works on both
  rails unchanged — the buyer's NWC client just pays whichever
  invoice we minted.

### Negative

- We add a runtime dependency on the merchant's chosen LN-address
  provider. If that provider goes down, the merchant's checkout is
  broken until we mint against a different address. Wapu had the
  same single-vendor risk for the ARS rail.
- We exclude legacy LN-address providers without LUD-21. The error
  message names the supported providers so the merchant can pick a
  compatible one.
- A merchant using the sats rail must monitor their own wallet
  health. With Wapu, the platform notices missed settlements via
  the webhook; with LUD-21 polling, an outage at the provider just
  shows up as orders stuck in `pending`.

### Neutral

- We do not add a per-offering rail toggle. A merchant who really
  wants to split (some courses in sats, some in ARS) needs two
  merchant accounts. Not a v1 use case.
- We do not add a buyer-side rail choice. The merchant decides.

## Alternatives considered

- **Require NWC for the sats rail (port the habits pattern).**
  Rejected: NWC requires the merchant to expose receive permissions
  and an encrypted secret on Cursats's server, plus a working relay.
  An LN address gives us the same outcome (sats land in the
  merchant's wallet) for one pasted string.
- **Per-offering rail.** Rejected: doubles the storefront complexity
  for a use case we do not yet have demand for. Adding it later is
  a column-only migration if needed.
- **Buyer-side rail choice (show both pay buttons).** Rejected: the
  hero copy commits to "el profe cobra sats *o* en pesos" — the
  merchant decides, the buyer pays. This is also simpler at
  checkout (one BOLT11, one QR).
- **Build our own LSP integration so we mint receive invoices for
  any merchant.** Rejected as both speculative and high-friction;
  delegating to the merchant's chosen provider via LN address is
  an order of magnitude lighter.

## References

- ADR [0002](0002-settlement-via-wapu.md) — the original Wapu-only
  decision; the settlement-rail-count clause is superseded by this
  ADR.
- ADR [0005](0005-prepaid-default-autorenewal-optin.md) — auto-
  renewal still applies to both rails.
- ADR [0008](0008-merchant-admin-dashboard.md) — the NIP-07 re-sign
  requirement on payment-destination changes carries over to
  `lightning_address` and `payout_method` flips.
- ADR [0012](0012-multi-tenant-marketplace.md) — per-merchant
  settings live on the `merchants` row, which is where the new
  fields land.
- LUD-21 spec: <https://github.com/lnurl/luds/blob/luds/21.md>.
