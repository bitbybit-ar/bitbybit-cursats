# 0030. Split the public Nostr Lightning Address from the payout one

- **Date**: 2026-05-24
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | — | Initial version. | The single `lightning_address` column served both public identity and payout, so the LUD-21 probe blocked profile saves (issue #30). |

---

## Context

`users.lightning_address` carried two unrelated jobs:

1. **Public identity** — the seller's Nostr `lud16`, shown on the
   storefront header for the "Send a zap" button and the Lightning QR,
   edited on the Profile tab (with sync-from / publish-to Nostr).
2. **Payout destination** — the settlement address for the
   `lightning_address` payout method, which **must** advertise LUD-21
   so the order poller can confirm payment server-side.

Because both wrote the same column, `PATCH /api/settings` ran the
LUD-21 probe on *any* change to it and returned HTTP 400 for the whole
request on failure. So a seller whose Nostr `lud16` lives on a
non-LUD-21 provider (Wallet of Satoshi, Primal, Strike — the wallets
this audience actually uses; see ADR
[0029](0029-nwc-sats-rail-input-method.md)) could not save their
display name, bio, or avatar either. This is the root of issue #30:
the profile never synced from Nostr at sign-in, and the manual
"Sync from Nostr → Save" workaround also failed whenever the synced
`lud16` lacked LUD-21.

ADR 0029 already removed the premise that a seller needs a LUD-21
address at all: `lightning_nwc` is the payout method for wallets
without LUD-21. So a public Nostr Lightning Address has no reason to
carry a LUD-21 requirement — only the `lightning_address` *payout
method* does.

## Decision

Split the concept into two columns:

- **`lightning_address`** stays the payout settlement destination for
  the `lightning_address` method. LUD-21-validated on save, edited only
  on the "How you get paid" tab (and the create-course payout modal),
  requires a NIP-98 re-sign (payment-destination field). Settlement
  (`lib/orders.ts`), `hasPayoutConfigured`, and `expectedPriceCurrency`
  are unchanged.
- **`nostr_lightning_address`** (new) is the public Nostr `lud16`.
  Edited on the Profile tab; format-validated only (`user@domain`); **no
  LUD-21 probe and no re-sign** — it is public identity, not a
  credential. Synced from / published to kind:0, and the only LN value
  exposed on the storefront (zap button + QR). `StorefrontSeller` now
  carries this field instead of the payout address.

A seller may use the same string for both, but only a LUD-21-capable
address survives the payout-tab probe; otherwise they use NWC or a
different address for payouts while keeping any `lud16` on their
profile.

Separately, fix the other half of issue #30: at sign-in,
`refreshUserFromKind0` now fills placeholder/empty row fields
(`display_name` while it equals the `user-<8hex>` placeholder; empty
`avatar_url` / `banner_url` / `bio` / `nostr_lightning_address`) from
kind:0, without clobbering values the user has edited. The `slug` is
left untouched to keep storefront URLs stable.

## Consequences

- Profile saves never trigger a LUD-21 probe or a signer prompt; the
  display-name sync works even when the seller's `lud16` provider lacks
  LUD-21.
- The payout address stops being exposed publicly; the storefront shows
  the explicitly public `nostr_lightning_address`. Migration `0014`
  backfills it from `lightning_address` so existing sellers keep a
  working zap button.
- One more nullable column on `users`. The payout/settlement path is
  untouched, so the money flow carries no migration risk.
- Amends ADR [0015](0015-sats-settlement-rail.md) (which treated
  `lightning_address` as a single field) and complements ADR 0029.
