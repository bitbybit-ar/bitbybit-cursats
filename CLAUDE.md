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
- **Has a backend** — API routes for the Wapu webhook, scheduled jobs
  for the optional auto-renewal flow. Cursats is **not** static-only
  like the `home` repo.
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

- **Payment surfaces are server-only.** Wapu API keys, NWC connection
  secrets, and webhook handlers live in API routes or server-only
  modules. Never expose them to the client. Use `NEXT_PUBLIC_*` only
  for non-secret display values.
- **Verify Wapu webhook signatures.** Every incoming webhook must be
  authenticated before any state change.
- **Two settlement rails, picked per user.** Wapu is still the
  only ARS rail (sats→ARS via Lightning, push to CBU/alias). The
  second rail receives sats directly to a seller's Lightning
  Address via LNURL-pay; the seller chooses one in `/settings`.
  Stored on the user row.
  The checkout API dispatches on `users.payout_method`. Do not
  introduce a third rail. Decision in ADR
  `docs/architecture/decisions/0015-sats-settlement-rail.md`
  (superseding the rail-count clause of ADR
  `docs/architecture/decisions/0002-settlement-via-wapu.md`).
- **LN settlement requires LUD-21.** The seller's LN-address
  provider must return a `verify` URL on its LNURL-pay callback;
  without it we have no server-side way to confirm payment. The
  settings PATCH mints a 1-sat probe invoice when a seller
  sets/changes their LN address and rejects providers that do not
  advertise LUD-21.
- **Wapu webhook only flips Wapu-rail orders.** A webhook delivery
  for an order whose `rail !== 'wapu_ars'` is refused with 404 and
  no body. The sats rail is verified by polling the order's
  `lnurl_verify_url` from `/api/orders/[orderId]`.
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
  `lib/site.ts`, secrets and `ADMIN_PUBKEYS` are in env
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
  name, picture → avatar, about → bio); the user can rename their
  slug from `/settings` later. There is no slug-claim gate, no
  separate `/onboarding` step. Mutations to orders/payments/buyers
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
  Legacy paths (pre-ADR-0014 `/panel/*` and the ADR-0014-era
  Spanish slugs) 308-redirect to the new URLs via `proxy.ts`.
  Reserved-slug list in `lib/admin/ar-bank-id.ts` blocks users from
  claiming any top-level route name (including `c` and `m`).
- **Notifications are a Postgres table polled by the navbar
  bell.** Wapu's `paid` webhook emits `order.paid` to the buyer
  (when signed in) and `sale.received` to the seller. Helpers
  live in `lib/notifications.ts`; the API surface is
  `/api/notifications` (GET/PATCH/POST).
- **Buyer-side avatar uses kind:0 metadata.** The
  `useNostrProfile` hook (`lib/hooks/useNostrProfile.ts`) fetches
  kind:0 from public relays via `nostr-tools/pool`, caches in
  localStorage with a 24h freshness window, and falls through
  picture → letter → `UserIcon` for the navbar avatar.
- **No email integration.** Delivery is the in-app receipt page
  (`/[locale]/gracias/[orderId]`) plus optional Nostr DMs. Decision
  in ADR
  `docs/architecture/decisions/0006-nostr-and-inapp-delivery.md`.
- **Nostr signing keys are server-only.** The deployment's
  `NOSTR_NSEC` lives in env vars and is consumed by API routes or
  server-only modules. Never ship it to the client.
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
