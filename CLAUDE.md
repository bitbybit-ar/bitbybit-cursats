# BitByBit Cursats — agent instructions

This file is the canonical guide for any AI agent (or human) working on
the BitByBit Cursats project. Read it before editing the repo.

## Project shape

- Next.js 16 (App Router) project at `cursats.bitbybit.com.ar`.
- Lightning checkout for Argentine educators. Sats in via the Lightning
  Network, ARS out to the seller's CBU/alias via **Wapu**.
- Built for La Crypta Hackathon #3 (Commerce). Wapu is the sponsor and
  the payment rail.
- next-intl (es default, en secondary). next-themes for light/dark.
- **Has a backend** — API routes for the Wapu deposit/withdrawal
  polling and a Vercel Cron that settles the seller payout leg.
  Cursats is **not** static-only like the `home` repo.
- Deploys to Vercel from a private GitHub repo at
  <https://github.com/bitbybit-ar/bitbybit-cursats>.

## Documentation standard

Every document under `docs/` — plus the root `CHANGELOG.md`,
`CONTRIBUTING.md`, and `CLAUDE.md` itself — **must** follow the
structure below. ADR files and runbook files keep their own
specialized header (Status / Deciders / Date for ADRs; Owner /
Severity / Last reviewed for runbooks) but still carry an inline
`## Change Log` section.

Top-level files at the repo root:

- `README.md` — project overview, quick links.
- `CHANGELOG.md` — product release log (Keep a Changelog + SemVer).
- `CONTRIBUTING.md` — contribution flow + vulnerability disclosure.
- `CLAUDE.md` — this file.

Everything else under `docs/`.

### Required header

```markdown
# <Document title>

> **Status:** Active | Draft | Deprecated | Superseded by <link>
> **Last updated:** YYYY-MM-DD

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| YYYY-MM-DD | — | Initial version. | <why this doc exists> |

---
```

Rules for the header:

- **Status** values: `Active`, `Draft`, `Deprecated`, or
  `Superseded by <relative-link>`. No other values.
- **Last updated** is the date of the most recent meaningful edit.
  Keep it in sync with the top row of the change log.
- The change log lives **inside the doc**, not in a central file. One
  global `CHANGELOG.md` at the repo root tracks **product releases**;
  per-doc change logs track **doc deltas**. They are different things.
- Change-log rows are append-style, **newest at the top**, with
  absolute ISO dates (`YYYY-MM-DD`).
- The **Reason** column is required — what motivated the change, not
  just what changed. If the answer is "typo" or "rephrasing", the row
  is probably not worth recording.
- Use `—` in `Section` for whole-document edits.

### Table of Contents

Add a `## Table of Contents` immediately after the change log **only
if** the document has 5+ top-level sections or is longer than ~150
lines. Short docs do not need a TOC.

### Style rules

- Sentence case for headings.
- Imperative mood in runbooks and guides.
- ISO 8601 dates everywhere.
- Hard-wrap at ~80 columns.
- One blank line between sections.
- Code fences always tagged with the language.
- No emoji unless the user explicitly asked.

### Where the canonical template lives

`docs/_template.md` in this repo. The cross-project canonical template
lives in the `home` repo (`bitbybit-ar/home/docs/_template.md`); this
repo's copy is intentionally identical and should stay in sync.

## Code rules (enforced)

- **Payment surfaces are server-only.** Wapu API keys and settlement
  logic live in API routes or server-only modules. Never expose them
  to the client. Use `NEXT_PUBLIC_*` only for non-secret display
  values. A seller's NWC URI (`users.nwc_uri`) is a wallet credential:
  it is stored AES-256-GCM-encrypted at rest (`lib/crypto.ts`, key
  `ENCRYPTION_KEY`), decrypted only in server routes, and never
  returned to the client — the settings API exposes a "connected"
  flag, not the URI. ADR 0029.
- **Wapu is a poll-driven, two-leg flow — there are no webhooks.**
  Wapu is a USDT-ledger wallet. Leg 1: a Lightning deposit
  (`POST /wallet/deposit_lightning`) credits USDT to our wallet; the
  buyer's checkout page polls the deposit transaction via
  `/api/orders/[orderId]`. Leg 2: once the deposit is `Completed` we
  open a fiat withdrawal (`POST /transactions/create`) to the
  seller's CBU/alias; the cron `/api/cron/wapu-settlements` polls it
  to completion. Auth is the `X-API-Key` header against
  `WAPU_PAY_APU_HOST`. Orchestration lives in `lib/wapu-settlement.ts`;
  the client is `lib/wapu.ts`. There is **no mock client**:
  `getWapuClient()` always builds the real client and throws when
  either env var is missing, so a misconfigured deploy fails loud
  instead of silently faking payments. The integration is verified by
  gated real-staging smoke tests (skipped without creds); order
  lifecycle tests seed order rows directly rather than funding through
  Wapu. Decision in ADR
  `docs/architecture/decisions/0025-wapu-poll-driven-two-leg-rail.md`
  (superseding the webhook posture of ADRs 0002 and 0012).
- **Two settlement rails, picked per user.** Wapu is still the
  only ARS rail (sats→ARS via Lightning, push to CBU/alias). The
  second rail (`direct_lightning`) receives sats directly to a
  destination the seller controls, via one of **two input methods**:
  a Lightning Address (LNURL-pay, LUD-21) **or** an NWC connection
  (NIP-47). The seller picks a method in `/settings`; the
  `payout_method` enum is `cbu_alias | lightning_address |
  lightning_nwc`, and both sats methods map to the
  `direct_lightning` order rail. The checkout API dispatches on
  `users.payout_method`. There are still only **two order rails** —
  NWC is a sats-rail input method, **not a third rail. Do not
  introduce a third rail.** Decisions in ADRs
  `docs/architecture/decisions/0015-sats-settlement-rail.md` and
  `docs/architecture/decisions/0029-nwc-sats-rail-input-method.md`
  (superseding the rail-count clause of ADR
  `docs/architecture/decisions/0002-settlement-via-wapu.md`).
- **The `lightning_address` method requires LUD-21; `lightning_nwc`
  is the alternative.** An LN-address provider must return a `verify`
  URL on its LNURL-pay callback or we cannot confirm payment
  server-side; the settings PATCH mints a 1-sat probe invoice on
  set/change and rejects providers without LUD-21. Most popular AR
  wallets (Primal, Strike) fail LUD-21 — recommend
  Alby or Blink for the LN-address method, and steer everyone else to
  NWC. Setting `nwc_uri` is validated with a probe `get_info` +
  `make_invoice`/`lookup_invoice`; we only use receive/lookup, so the
  UI tells the seller to issue a connection **without** `pay_invoice`.
  ADR 0029 supersedes the absolute "LN settlement requires LUD-21"
  posture of ADR 0015. The LUD-21 probe applies **only** to the payout
  `lightning_address`; the public Nostr address is a separate field
  (see next bullet).
- **Two Lightning Addresses, two columns.** `users.lightning_address`
  is the LUD-21-validated **payout** destination, edited only on the
  "How you get paid" tab. `users.nostr_lightning_address` is the
  **public** Nostr `lud16`, edited on the Profile tab, synced
  from/published to kind:0, and the only LN value shown on the
  storefront (zap button + QR). The public one accepts any address —
  **no LUD-21 probe, no NIP-98 re-sign** (it is identity, not a
  payout). Do not run the payout probe on profile saves. Decision in
  ADR `docs/architecture/decisions/0030-split-public-nostr-ln-address-from-payout.md`
  (amending ADR 0015). At sign-in, `refreshUserFromKind0`
  (`lib/creator/users.ts`) fills placeholder/empty row fields from
  kind:0 without clobbering edits — this is what fixes the
  placeholder-display-name bug (issue #30); the `slug` is never
  auto-changed.
- **Both rails are verified by polling, never a webhook.** On
  `/api/orders/[orderId]`: a `wapu_ars` order polls its Wapu deposit
  transaction (`pollWapuDeposit`); a `direct_lightning` order polls
  either the seller's LUD-21 `lnurl_verify_url` (`lightning_address`)
  or the seller's wallet via NWC `lookup_invoice` (`lightning_nwc`),
  per the sub-method stamped on the order at creation. Buyer-paid
  effects (`markOrderPaid` + draw code + notifications) are shared.
  The `wapu_ars` seller payout leg is tracked separately on
  `orders.payout_status` and advanced by the settlement cron.
- **Price currency follows the payout rail; the seller bears the
  Wapu fee.** `cbu_alias` sellers price in ARS; both sats methods
  (`lightning_address` and `lightning_nwc`) price in sats — there is
  no free per-course picker
  (`expectedPriceCurrency` in `lib/creator/users.ts`; `/api/my-courses`
  rejects a mismatch). On the ARS rail the seller receives
  `gross − fee`; the create-course form previews it via
  `/api/payout-quote` and the withdrawal pays the net (both use
  `quoteSellerPayout`). The net must clear Wapu's 10 000 ARS
  withdrawal floor (`WAPU_MIN_NET_ARS` in `lib/wapu-limits.ts`); the
  form and `/api/my-courses` reject `price_below_wapu_minimum` below
  it. Decision in ADR
  `docs/architecture/decisions/0026-price-currency-follows-payout-rail.md`
  (superseding ADR 0019).
- **Catalog and runtime settings live in Postgres.** Offerings,
  CBU/alias, Lightning Address, payout method, and the autorenewal
  toggle are rows in Postgres (drizzle), edited from
  `/[locale]/my-courses` and `/[locale]/settings`. No stock counts,
  no variants, no inventory. Decision in ADR
  `docs/architecture/decisions/0009-offerings-and-settings-in-database.md`,
  superseding the catalog half of ADR
  `docs/architecture/decisions/0004-static-config-deployment.md`.
  The single-tenant deployment posture from ADR 0004 still
  stands.
- **No `merchant.yaml`.** There is no YAML configuration file in
  the repo. Branding is in `styles/_theme.scss`, copy is in
  `messages/{es,en}.json`, site identity is in
  `lib/site.ts`, secrets are in env
  vars, and operational state (offerings, settings) is in
  Postgres. Decision in ADR
  `docs/architecture/decisions/0010-no-yaml-config.md`.
- **Auto-renewal is deferred from MVP.** The `users.features_
  autorenewal` column was dropped in migration
  `0009_drop_features_autorenewal.sql`, the input schema no
  longer accepts the field, and no checkout/cron code reads it.
  Re-introducing the feature is a future-tracked item and will
  need a fresh migration; in v1 every purchase is one-shot.
  Decision in ADR
  `docs/architecture/decisions/0020-defer-autorenewal-from-mvp.md`,
  superseding the runtime-toggle posture of ADR 0005.
- **Creator surfaces are open to every signed-in user.** Any
  Nostr-authenticated session can reach `/[locale]/my-courses`,
  `/[locale]/create-course`, `/[locale]/settings`, and
  `/[locale]/orders`. The user row is auto-created at sign-in
  (`ensureUserForPubkey` from `/api/auth/nostr`) seeded from
  the user's Nostr kind:0 metadata (display_name → slug + display
  name, picture → avatar, about → bio). The slug is assigned at
  sign-in and is not user-editable in v1 (`UpdateUserProfileSchema`
  has no `slug` field; `/settings` only displays it). There is no
  slug-claim gate, no separate `/onboarding` step. Mutations to orders/payments/buyers
  are out of v1 scope (read-only); offerings get full CRUD;
  settings updates that touch payment-destination fields (CBU,
  alias, Lightning Address, payout_method) require a NIP-07
  re-sign at save time. Decision in ADR
  `docs/architecture/decisions/0014-marketplace-open-to-all-logged-in-users.md`,
  superseding ADRs 0008 and 0012. The `merchants` table was
  renamed `users` end-to-end in ADR 0016 (column `merchant_id`
  → `user_id` on offerings/orders/admin_audit_log).
- **All logged-in routes are English under a `(logged-in)` route
  group.** `/settings`, `/my-courses`, `/create-course`,
  `/orders`, `/purchases`. Public routes follow the same English
  convention: `/explore`, `/sign-in`, `/receipt/[orderId]`,
  `/claim/[orderId]`. Seller pages live at the top level:
  `/[userSlug]` (storefront) and `/[userSlug]/c/[offeringSlug]`
  (offering detail) — ADR 0017 dropped the previous `/m/` prefix
  before launch. `/checkout/[orderId]` keeps its existing name.
  Legacy paths are **not** redirected: old URLs (pre-ADR-0014
  `/panel/*` and the ADR-0014-era Spanish slugs like `/mis-cursos`,
  `/configuracion`, `/explorar`) 404. ADR 0028 removed the
  `proxy.ts` redirect layer pre-launch; `proxy.ts` now only gates
  creator routes and runs the next-intl locale rewrite. The
  reserved-slug list in `lib/creator/ar-bank-id.ts` still blocks users
  from claiming any top-level route name (including `c` and `m`) and
  those legacy names.
- **Notifications are a Postgres table polled by the navbar
  bell.** When a deposit confirms, `order.paid` goes to the buyer
  (when signed in) and `sale.received` to the seller. The wapu_ars
  payout leg adds `payout.pending` (withdrawal opened),
  `payout.released` (ARS settled), and `payout.failed`. Helpers
  live in `lib/notifications.ts`; the API surface is
  `/api/notifications` (GET/PATCH/POST).
- **Buyer-side avatar uses kind:0 metadata.** The
  `useNostrProfile` hook (`lib/hooks/useNostrProfile.ts`) fetches
  kind:0 from public relays via `nostr-tools/pool`, caches in
  localStorage with a 24h freshness window, and falls through
  picture → letter → `UserIcon` for the navbar avatar.
- **No email integration and no Nostr DM channel.** Delivery is
  the in-app receipt page (`/[locale]/receipt/[orderId]`) only.
  Decision in ADR
  `docs/architecture/decisions/0006-nostr-and-inapp-delivery.md`.
- **No buyer-side wallet detection.** Buyers came to a sats checkout
  to pay sats. Every purchase is one-shot — there are no renewable
  subscriptions in v1 (see the auto-renewal deferral above).
- Every user-facing string goes through next-intl. Add the key to
  **both** `messages/es.json` and `messages/en.json` in the same
  change.
- New colors/spacing/typography go into `styles/_theme.scss` as
  tokens. Never hardcode hex or px values.
- One `<h1>` per page.
- External links carry `target="_blank" rel="noopener noreferrer"`.
- All raster images go through `next/image`. `priority` only on hero
  images.
- Follow the existing component layout: `Foo/index.tsx` +
  `Foo/foo.module.scss`.

## When you make a change

1. Update the affected doc's `## Change Log` table.
2. Update `## Last updated` to today's date.
3. If the change is user-visible at the product level, also add a row
   in the **root** `CHANGELOG.md` under `## [Unreleased]`.
4. If the change is a significant architectural decision, also add an
   ADR under `docs/architecture/decisions/`. A decision is
   "significant" if changing it later would require touching multiple
   files, retraining the team, or coordinating a migration.

## Pointers

- Stack and high-level architecture: `docs/architecture/overview.md`.
- Full route map (buyer, account, creator, API): `docs/architecture/routing.md`.
- Mission and product positioning: `docs/about/mission.md`.
- Architecture decisions: `docs/architecture/decisions/`.
- Doc template: `docs/_template.md`.
- Project release log: root `CHANGELOG.md`.
- Sister project (org landing): `~/Documents/projects/bitbybit/home/`.
- Sister project (auth module to port): `~/Documents/projects/bitbybit/bitbybit-arena/`.
