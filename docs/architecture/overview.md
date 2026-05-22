# Architecture overview

> **Status:** Active
> **Last updated:** 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | SEO surface | Rewrote the OG image description: it is now brand-led (block mark + `CURSATS` wordmark + giant wordmark hero + one `ogValueLine`) instead of a burned-in headline/tagline, and `og.png` is a baked twin of the route. Swapped the `ogHeadline`/`ogTagline` key reference for `ogValueLine`. | The social card duplicated its own headline/tagline in the link title and description, and its logo read "BitByBit Cursats" with horizontal off-brand blocks; the redesign fixes the mark and removes the repetition. |
| 2026-05-21 | Auto-renewal flow, Ownership of state | Replaced the full autorenewal flow description and diagram with a deferred-from-MVP pointer to ADR 0020; removed the "Autorenewal toggle" row from the ownership table. | ADR 0020 was revised to drop the column outright (migration 0009). The overview was still describing the dormant-but-deployed posture the original ADR walked back. |
| 2026-05-19 | External services | Added Yadio as the live sats↔ARS exchange-rate source. | The storefront was quoting against a 4-sats/ARS mock (~4.5× off); ADR 0022 wired the real rate. |
| 2026-05-12 | — | Rebranded references from "Cursá" to "Cursats" and updated the deployment URL to `cursats.bitbybit.com.ar`. Aligned the example storefront URLs with ADR 0017 (flat `/<userSlug>` instead of `/m/<userSlug>`). | Brand rename per ADR 0018 — portmanteau of *cursá* (the voseo verb) and *sats*. |
| 2026-05-12 | What this app is, Routing, Identity model, Creator surfaces (renamed from Merchant admin panel), Stack, Configuration model, Auto-renewal flow, Security, What is intentionally not here, Table of Contents | Replaced single-tenant framing with multi-tenant marketplace; replaced "Wapu only" with the dual-rail model (Wapu ARS + Lightning Address direct sats); removed the `/panel/*` namespace and the `ADMIN_PUBKEYS`-gated admin posture; renamed the panel section to "Creator surfaces" and pointed it at the top-level English routes; updated the Stack image-storage line from Vercel Blob to Blossom; renamed `lib/merchant.ts` → `lib/site.ts` and `merchants` → `users` in the configuration table. | The doc was three pivots behind reality (ADR 0014 opened the marketplace, ADR 0015 added the second rail, ADR 0016 collapsed `merchants` into `users`). Contributors reading this would have built against an architecture that no longer exists. |
| 2026-05-07 | Stack | Replaced the dead `docs.wapu.app/api-docs/en` reference in the Wapu line with: (a) the actual API base URLs for production and staging, and (b) a pointer to the wapu-cli repo as the public source of the API contract until Wapu publishes formal docs. | The original URL 404s; the wapu-cli repo (github.com/wapu-app/wapu-cli) is currently the only public source of the API contract, and Wapu runs a staging environment at staging.wapu.app for fake-money testing. Future contributors should not waste time on the broken URL. |
| 2026-05-06 | What this app is, Stack, Routing, Auto-renewal flow, Notifications & delivery, Merchant config, Security, What is intentionally not here, Table of Contents | Replaced the Routing section with a short pointer to `routing.md` (full route map now lives there). Rewrote the Merchant config section: `merchant.yaml` is removed; offerings + CBU/alias + autorenewal flag now live in Postgres and are edited from `/panel`; branding/copy/identity stay in code; `ADMIN_PUBKEYS` lives in env. Updated the auto-renewal flow paragraph: flag is a runtime panel toggle, code is dormant when off. Added Postgres + drizzle and Vercel Blob to the Stack list. Added the panel surface and admin-only API namespace to Security. Removed "no buyer accounts" and "no admin UI" from "What is intentionally not here" (they exist now per ADRs 0007 and 0008). Updated TOC. | ADRs 0007–0010 introduced Postgres, optional Nostr login, the merchant admin panel, offerings + settings in DB, and removed `merchant.yaml`. The overview was the most code-shaped doc in the repo and was lying about all of these. |
| 2026-05-06 | Notifications & delivery, Payment flow, Auto-renewal flow, Security, Merchant config, What is intentionally not here, Table of Contents | Added the Notifications & delivery section. Removed email from the payment flow diagram, the auto-renewal flow diagram, the security section, the merchant config (`merchant.email` field dropped), and the intentionally-not-here list (added "no email"). Updated TOC. | The decision in ADR 0006 makes the delivery channel in-app receipt + optional Nostr DM. The overview was still describing an email-based model that no longer matches the architecture. |
| 2026-05-06 | SEO surface, Theming, Table of Contents | Added the SEO surface section (per-locale metadata, Organization + WebSite JSON-LD, dynamic OG image, sitemap, robots, manifest) and the Theming section (next-themes wrapper, copied token system, Nunito + Nunito Sans via next/font). Documented the new `app/manifest.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/[locale]/opengraph-image.tsx`, `lib/contexts/theme-context.tsx`, `lib/env.ts`, `lib/seo.ts`. | The initial scaffold landed those pieces; the overview must reflect what the code actually does so contributors don't have to reverse-engineer it. |
| 2026-05-05 | — | Initial version. | Document the v0 architecture before any code lands so the scaffold has a reference shape to follow. |

---

## Table of Contents

1. [What this app is](#what-this-app-is)
2. [Stack](#stack)
3. [Routing](#routing)
4. [Identity model](#identity-model)
5. [Creator surfaces](#creator-surfaces)
6. [SEO surface](#seo-surface)
7. [Theming](#theming)
8. [Product primitives](#product-primitives)
9. [Payment flow](#payment-flow)
10. [Auto-renewal flow (optional)](#auto-renewal-flow-optional)
11. [Notifications & delivery](#notifications--delivery)
12. [Configuration model](#configuration-model)
13. [Security](#security)
14. [What is intentionally not here](#what-is-intentionally-not-here)

---

## What this app is

Cursats is a Next.js multi-tenant marketplace at
`cursats.bitbybit.com.ar`. Any signed-in Nostr user is implicitly
a creator; the user row is materialised on first sign-in (`ensureUserForPubkey`)
and the seller picks a slug and a payout method from
`/[locale]/settings`. There is no fork, no separate deployment, no
forced onboarding. Self-hosting survives as the path for anyone
who wants their own instance, but the hosted marketplace is the
default. Decision pinned in ADR
[0014](decisions/0014-marketplace-open-to-all-logged-in-users.md).

A buyer visits `cursats.bitbybit.com.ar`, browses the global catalog
or a creator storefront at `/<userSlug>`, opens an offering at
`/<userSlug>/c/<offeringSlug>`, gets a Lightning invoice, pays
it, and lands on a permanent receipt page at
`/[locale]/receipt/[orderId]` that shows their redemption code or
download link. If they connected a Nostr identity at checkout (or
signed in with one), an encrypted DM with the same content lands
in their Nostr client. Buyers may optionally sign in with Nostr
to see their full order history at `/[locale]/purchases`;
purchase never requires it.

Sellers pick one of two payout rails in `/[locale]/settings`,
stored as `users.payout_method`. Decision pinned in ADR
[0015](decisions/0015-sats-settlement-rail.md).

- **`wapu_ars`** — Wapu sits between the Lightning invoice and the
  seller's bank. It accepts the sats, converts to ARS at market
  rate, and pushes pesos to the seller's CBU or alias. The
  inclusive on-ramp for sellers who want pesos for daily expenses
  and don't want to learn Bitcoin.
- **`lightning`** — The buyer's invoice resolves directly through
  the seller's Lightning Address (LNURL-pay with LUD-21 `verify`).
  No converter, no platform-side wallet — the sats land in the
  seller's wallet of record.

The checkout API dispatches on `users.payout_method`; the Wapu
webhook only flips orders whose `rail === 'wapu_ars'`. Lightning-rail
orders are confirmed by polling the seller's `lnurl_verify_url`
from `/api/orders/[orderId]`.

## Stack

- **Next.js 16** (App Router) — server-rendered for any route
  that touches Postgres or secrets; static where possible.
- **next-intl** — Spanish (default) and English; locale routed via
  `app/[locale]/...`.
- **next-themes** — Light/dark mode.
- **SCSS modules** — per-component styles. Tokens in
  `styles/_theme.scss`.
- **Postgres + drizzle-orm** — orders, sessions, offerings,
  settings, audit log. Stack matches bitbybit-arena. Schema and
  rationale in ADR
  [0009](decisions/0009-offerings-and-settings-in-database.md).
- **Blossom** — image storage for offerings, written browser-direct
  by a kind:24242 signed event (no server proxy). Servers are
  configured in `NEXT_PUBLIC_BLOSSOM_SERVERS`. Decision pinned in
  ADR [0011](decisions/0011-image-storage-via-blossom.md).
- **Wapu API** — Lightning invoice creation, ARS withdrawal,
  payment status. Production base
  `https://be-prod.wapu.app`; staging base
  `https://staging.wapu.app` (fake-money testing). Auth header is
  `X-API-Key`. The public source of the API contract is
  <https://github.com/wapu-app/wapu-cli> until Wapu publishes
  formal docs; the relevant endpoints are `POST
  /wallet/deposit_lightning` (Lightning invoice), `GET
  /transactions/{id}` (status), and `POST /transactions/create`
  (ARS withdrawal as a `fiat_transfer`).
- **Yadio** — live sats↔ARS exchange rate for the storefront
  (`https://api.yadio.io/convert/1/BTC/ARS`, the Argentine
  parallel/crypto rate Wapu settles against). Free, keyless,
  overridable via `EXCHANGE_RATE_API_URL`. Read through the single
  `lib/exchange-rate.ts:getSatsPerArs()` seam with a 5-minute cache
  → last-good → static fallback chain. Decision in ADR
  [0022](decisions/0022-live-exchange-rate-via-yadio.md).
- **Nostr** — server-side signing for outgoing DMs (`nostr-tools`
  + `@noble/secp256k1`); NIP-07 / nsec / NIP-46 client-side for
  buyer identity at checkout, buyer/seller login (ADRs
  [0007](decisions/0007-optional-nostr-buyer-login.md) /
  [0014](decisions/0014-marketplace-open-to-all-logged-in-users.md)),
  and per-mutation re-sign at save time on payment-destination
  fields (CBU / alias / Lightning Address) in `/settings`.
- **`jose`** — signs the session JWT held in an httpOnly cookie.
- **Vercel** — Hobby plan plus Vercel Cron when auto-renewal is on.

## Routing

The full route map — buyer flow, account, creator, static, API —
lives in [`routing.md`](routing.md). A short summary:

```text
/                                → landing + catalog (Spanish, no prefix)
/en                              → landing + catalog (English)
/[locale]/explore                → global catalog
/[locale]/m/[userSlug]           → seller storefront
/[locale]/m/[userSlug]/c/[offeringSlug]
                                 → offering detail + buy button
/[locale]/checkout/[orderId]     → invoice + QR + status poll
/[locale]/receipt/[orderId]      → permanent receipt page
/[locale]/claim/[orderId]        → claim a past anonymous order

/[locale]/sign-in                → Nostr sign-in (NIP-07/nsec/NIP-46)

/[locale]/purchases              → buyer order history (logged in)
/[locale]/my-courses             → seller's offerings (logged in)
/[locale]/create-course          → new offering form (logged in)
/[locale]/orders                 → seller's sales history (logged in)
/[locale]/settings               → payout, slug, autorenewal toggle

/api/wapu/webhook                → Wapu payment events (rail = wapu_ars only)
/api/orders/[orderId]            → order status (also probes LN verify URL)
/api/auth/*                      → Nostr session
/api/my-courses, /api/settings   → seller-scoped CRUD
/api/notifications               → navbar bell
```

Legacy paths (pre-ADR-0014 `/panel/*` and the ADR-0014-era
Spanish slugs) 308-redirect via `proxy.ts`. See
[`routing.md`](routing.md) for the rest, conventions, and the
rationale for each slug.

## Identity model

Three buyer identity tiers (ADR
[0007](decisions/0007-optional-nostr-buyer-login.md)):

1. **Anonymous.** Pay, land on `/receipt/[orderId]`, get the
   code, walk away. The opaque URL is the only access key.
2. **Anonymous with Nostr identifier.** Buyer pastes an
   `npub1...` or NIP-05 (`name@domain.com`) at checkout; the
   server resolves NIP-05 via `/api/nip05/resolve` and sends an
   encrypted DM with the receipt URL. No session.
3. **Logged-in via Nostr.** NIP-07 / nsec / NIP-46 sign-in
   issues a `jose` JWT in an httpOnly cookie. Orders link to the
   session pubkey; `/[locale]/purchases` lists them; DMs are
   automatic. The same sign-in materialises the user row
   (`ensureUserForPubkey`) so the same identity also unlocks the
   creator surfaces.

Auto-renewal subscribers get tier 3 implicitly — the NWC
connection already exposes their pubkey.

Platform-level moderation lives in `PLATFORM_ADMIN_PUBKEYS` (env,
comma-separated) and gates a small set of admin tools. It is not
the panel gate (the panel doesn't exist anymore); it controls
inactivation/moderation of users by the BitByBit team. Decision
pinned in ADR
[0014](decisions/0014-marketplace-open-to-all-logged-in-users.md).

## Creator surfaces

Any signed-in user can reach the creator surfaces; the user row is
created lazily on first hit (`requirePanelUser` in
`lib/admin/require-user.ts`). There is no `/panel/*` namespace
(removed in ADR
[0014](decisions/0014-marketplace-open-to-all-logged-in-users.md))
— creator pages are top-level English routes inside the
`(logged-in)` route group:

| Route | Purpose |
|---|---|
| `/[locale]/my-courses` | List + archive of the user's offerings |
| `/[locale]/my-courses/[slug]/edit` | Edit offering, archive button lives here |
| `/[locale]/create-course` | New offering form |
| `/[locale]/orders` | Sales history, read-only in v1 |
| `/[locale]/orders/[orderId]` | Sale detail (payment hash, rail, settlement ref, redemption) |
| `/[locale]/settings` | Payout method (Wapu CBU/alias OR Lightning Address), slug + display name, autorenewal toggle |

- **Auth.** Edge gate in `proxy.ts` requires a signed-in session;
  anonymous visitors bounce to `/sign-in?next=...`. Server-side,
  each page's `requirePanelUser` materialises the user row on
  first hit.
- **Write in v1**: offerings (full CRUD), settings (CBU, alias,
  Lightning Address, payout method, autorenewal toggle).
  Mutations to payment-destination fields (CBU, alias, Lightning
  Address) require a NIP-07 re-sign at save time, so a stolen
  session cookie cannot quietly redirect future settlement.
- **Read-only in v1**: orders, payments, buyers. Refunds,
  resends, and DM-from-the-UI are deferred to v1.1.
- **Audit log.** Every mutation writes a row to
  `admin_audit_log` (column `user_id` since ADR 0016).

Routes inventory and request shapes live in
[`routing.md`](routing.md).

## SEO surface

- Per-locale `generateMetadata` in `app/[locale]/layout.tsx`
  produces title, description, keywords, OG, Twitter, robots,
  canonical, and `hreflang` alternates. The canonical and
  alternates use the helper at `lib/seo.ts`.
- `Organization` and `WebSite` JSON-LD are injected in the
  `<head>` from the layout. The `Organization` block sets
  `parentOrganization` to BitByBit so search engines associate
  Cursats with the wider org.
- Dynamic OG image rendered per locale via `next/og` at
  `app/[locale]/opengraph-image.tsx`. It is brand-led: the
  vertically stacked block mark plus the `CURSATS` wordmark (the
  same blue/lime/pink hues as `<LogoBlocks />` / `<Wordmark />`),
  a giant wordmark hero, and one short value line from
  `messages/{locale}.json` (`metadata.ogValueLine`). That value
  line is the brand slogan ("Cursá tu próxima clase con sats" /
  "Your next class, paid in sats"), which also doubles as the link
  title (`metadata.siteTitle`); the long product description stays
  out of the image and lives only in the link description.
  `public/og.png` is a baked copy of the same design,
  referenced first in the metadata for crawlers that miss the
  file-convention endpoint (notably WhatsApp); regenerate it from
  the same layout whenever the route's design changes.
- `app/sitemap.ts` lists `/es` and `/en` with hreflang alternates.
- `app/robots.ts` allows everything except `/api/` and `/_next/`.
- `app/manifest.ts` declares the standalone PWA shell with
  Cursats's name, short name, theme color (yellow), and icon.
- `lib/env.ts` centralises the `NEXT_PUBLIC_BASE_URL` lookup —
  every SEO surface uses it via `getBaseUrl()` and throws at boot
  if the env var is missing.
- The placeholder favicon at `public/icons/icon.svg` is the
  BitByBit family logo. Replace it with Cursats's own mark when
  brand work lands.

## Theming

- `next-themes` is wired through the wrapper at
  `lib/contexts/theme-context.tsx`, the same wrapper used by the
  `home` repo. Light is the default; dark toggles by setting
  `data-theme="dark"` on `<html>`. The `useTheme()` re-export
  adds a `toggleTheme()` shortcut and exposes a `ThemePreference`
  type.
- Token system copied from `home`: `styles/_theme.scss` defines
  atomic gray and yellow scales, semantic role tokens
  (`--color-primary`, `--color-secondary`, `--focus-ring`), and
  decorative tokens kept identical to arena so cross-project
  components (Button, Card, Container, Section, Toast) render
  consistently.
- Fonts: `Nunito` (display) and `Nunito Sans` (body) loaded via
  `next/font/google` in the root layout, exposed as
  `--font-display` and `--font-body` CSS custom properties
  consumed by `styles/_typography.scss`. The variants used today
  are `700`/`800` for display and `400`/`500`/`600` for body —
  add weights here when a component needs them. Falls back to
  `Nunito` / `Nunito Sans` system installs and then the platform
  default if the Google Fonts CDN is unreachable.

## Product primitives

Every offering in a seller's catalog is one of two types:

1. **`code`** — buyer pays, the receipt page shows a redemption
   code (and an optional Nostr DM mirrors the same content). The
   buyer shows the code to the seller in person. Used for
   single classes, lesson packs, monthly bonos.
2. **`download`** — buyer pays, the receipt page shows a
   short-lived signed URL pointing at a private file. Used for
   PDF method books, sheet music, recorded course material.

Both share: catalog → invoice (Wapu or LNURL-pay) → confirmation
(Wapu webhook or LUD-21 verify poll) → receipt page (and optional
Nostr DM). The receipt content is the only difference.
See [Notifications & delivery](#notifications--delivery) for the
delivery model in detail.

## Payment flow

The buyer always pays in sats over Lightning; the path the sats
take from there depends on which rail the seller picked in
`/settings`.

### Rail = `wapu_ars` (sats → ARS to seller's CBU)

```text
Buyer              Cursats app             Wapu              Seller bank
  │                    │                   │                     │
  │── click "Comprar" ▶│                   │                     │
  │                    │── create invoice ▶│                     │
  │                    │◀── invoice ───────│                     │
  │◀── show QR + amt ──│                   │                     │
  │── pay invoice (LN) ────────────────────▶                     │
  │                    │◀── webhook: paid ─│                     │
  │◀── receipt + code ─│                   │                     │
  │                    │── (opt) Nostr DM ─────────────────────  │
  │                    │                   │── ARS payout ──────▶│
```

The Wapu webhook handler is the source of truth for "payment
confirmed" on this rail.

### Rail = `lightning` (direct sats to seller's Lightning Address)

```text
Buyer              Cursats app          Seller's LNURL provider
  │                    │                       │
  │── click "Comprar" ▶│                       │
  │                    │── LNURL-pay callback ▶│
  │                    │◀── invoice + verify ──│
  │◀── show QR + amt ──│                       │
  │── pay invoice (LN) ────────────────────────▶  (sats land in seller's wallet)
  │                    │── poll verify URL ───▶│
  │                    │◀── settled = true ────│
  │◀── receipt + code ─│                       │
  │                    │── (opt) Nostr DM ─────│
```

The seller's LNURL-pay `verify` URL (LUD-21) is the source of
truth on this rail; `/api/orders/[orderId]` polls it. The Wapu
webhook is refused with 404 for any order whose `rail` is not
`wapu_ars`.

In both cases, polling the checkout page is a UX nicety, not the
trigger. Once confirmed, the buyer is redirected to their
permanent receipt page at `/[locale]/receipt/[orderId]`; if they
connected a Nostr identity at checkout, an encrypted DM with the
same content goes out from the deployment's npub.

## Auto-renewal flow (deferred from MVP)

Deferred per ADR
[0020](decisions/0020-defer-autorenewal-from-mvp.md). The settings
toggle, the `users.features_autorenewal` column, and the input
field on `UpdateUserProfileSchema` are all gone (migration
`0009_drop_features_autorenewal.sql`). Every purchase in v1 is a
one-shot; the section is left here as a pointer for the
re-introduction ADR so it has something to supersede.

No NWC client, cron worker, or encrypted-secrets storage ships in
v1; a future ADR that re-enables autorenewal will need a fresh
schema (the original single-boolean column was not going to
survive a real implementation anyway) and will rebuild the
checkout's "Autorenovar" CTA from scratch.

## Notifications & delivery

Cursats does not integrate with email. Two channels deliver content
and notifications: an **in-app receipt page** and **optional
Nostr DMs**. Decision pinned in ADR
[0006-nostr-and-inapp-delivery](decisions/0006-nostr-and-inapp-delivery.md).

### In-app receipt page

Every paid order has a permanent receipt page at
`/[locale]/receipt/[orderId]` where `orderId` is an opaque,
unguessable identifier. It renders the redemption code (for
`code` offerings) or a short-lived signed download URL (for
`download` offerings) plus the order summary.

The receipt page is the **always-available** delivery channel —
it does not depend on the buyer providing any identity. Buyers
save the URL or screenshot the code.

### Optional Nostr push

A buyer who connects a Nostr identity at checkout (NIP-07 browser
extension or pasted npub) receives a NIP-44-encrypted DM with the
receipt URL right after the webhook confirms payment.

**Auto-renewal subscribers** always receive Nostr DMs for renewal
confirmations and cancellations: their pubkey is already known
from the NWC connection. No separate identity prompt.

### Non-Nostr buyers

Pre-paid buyers who do not connect Nostr have no push channel.
They keep the receipt URL they were shown at checkout. For
expiring lesson packs, the storefront UI can show "Renová tu
bono" CTAs to bring them back.

### Cursats's signing identity

The deployment uses a server-side Nostr key (env: `NOSTR_NSEC`)
to sign and encrypt outgoing DMs. The key never reaches the
client. A new key just means a new npub for outgoing DMs;
buyers read by their own pubkey, not by Cursats's identity, so
key rotation is bounded.

## Configuration model

There is no YAML configuration file. Each piece of state has
exactly one editor and exactly one editing surface. Decision in
ADR [0010](decisions/0010-no-yaml-config.md), with the storage
shape in ADR [0009](decisions/0009-offerings-and-settings-in-database.md).

| Layer | Edited by | Lives in |
|---|---|---|
| Branding tokens | the developer | `styles/_theme.scss` |
| Page copy, FAQ, terms | the developer | `messages/{es,en}.json` |
| Site identity, social links | the developer | `lib/site.ts` |
| Secrets (Wapu key, NSEC, DB URL) | the deployer | env vars |
| Platform-admin authorisation | the deployer | env var `PLATFORM_ADMIN_PUBKEYS` (comma-separated) |
| Slug, display name, bio | the seller | Postgres `users`, `/[locale]/settings` |
| Payout method + destination (CBU/alias OR Lightning Address) | the seller | Postgres `users`, `/[locale]/settings` |
| Offerings (catalog) | the seller | Postgres `offerings`, `/[locale]/my-courses` |
| Orders, sessions, notifications | nobody | Postgres, system-managed |

First-run experience: a new visitor signs in with Nostr →
`ensureUserForPubkey` materialises a placeholder user row keyed
by pubkey (slug auto-generated as `user-<first-8>`, profile
seeded from kind:0 metadata) → the user lands on `/my-courses`,
renames their slug if they want, picks a payout method in
`/settings`, and creates their first offering. The seller's
storefront cannot accept buyers until at least one offering is
published and the payout fields for the chosen rail are filled
in.

## Security

- HTTPS via Vercel, HSTS preload set.
- Wapu API key, NWC encryption key, the deployment's Nostr
  signing key (`NOSTR_NSEC`), the session JWT signing key, the
  Postgres connection string, and the `PLATFORM_ADMIN_PUBKEYS`
  list all live in Vercel environment variables. Never reach the
  client.
- Wapu webhook signature is verified before any state mutation.
- NWC connection strings are encrypted at rest with a
  per-deployment key. Loss of that key means subscriptions are
  unrecoverable; that is the intended trade-off versus running
  our own KMS.
- Signed download URLs expire after 24 hours and are single-use.
- Receipt-page `orderId`s are opaque, unguessable identifiers
  (≥128 bits of entropy). Knowing one order's URL does not let
  you enumerate other orders.
- Outgoing Nostr DMs are NIP-44 encrypted to the buyer's pubkey.
  Relay delivery is best-effort; the in-app receipt page is the
  canonical record.
- The buyer session is a `jose`-signed JWT held in an httpOnly,
  Secure, SameSite=Lax cookie. It carries the pubkey and an
  expiry; never a private key.
- The edge middleware in `proxy.ts` requires a signed-in session
  for every creator surface (`/settings`, `/my-courses`,
  `/create-course`, `/orders`, `/purchases`); anonymous visitors
  bounce to `/sign-in?next=...`. Server-side, each page's
  `requirePanelUser` resolves (or lazily creates) the user row.
  Inactive users (set by `PLATFORM_ADMIN_PUBKEYS` moderation
  tools) 404 instead of rendering.
- Updates to payment-destination fields (CBU, alias, Lightning
  Address) require a NIP-07 re-sign at save time. A stolen
  session cookie alone cannot redirect future settlement to an
  attacker's bank or wallet. A new Lightning Address must pass a
  1-sat LUD-21 probe before it is accepted.
- Every creator-side mutation writes a row to `admin_audit_log` —
  timestamp, actor pubkey, route, action, payload diff (secrets
  redacted). Read-only forever; there is no UI to delete rows.
- All external links use `target="_blank" rel="noopener noreferrer"`.
- CSP set in `next.config.ts` headers — `default-src 'self'`,
  scripts from self, images from `https:` and `data:`. Fonts
  from `fonts.gstatic.com` and styles from `fonts.googleapis.com`
  are allowed for `next/font/google`. The Wapu invoice QR is
  generated client-side; no third-party QR service is loaded.

## What is intentionally not here

- No email integration. No email-sender provider, no email field
  at checkout, no inbox-deliverability concerns.
- No *required* buyer accounts. Anonymous purchase is always
  available; the opaque receipt URL is enough to walk away with
  the redemption code. Optional Nostr login adds history and
  reliable DM push (ADR
  [0007](decisions/0007-optional-nostr-buyer-login.md)).
- No forced onboarding flow. Sign in with Nostr and you have a
  user row immediately (placeholder slug, profile seeded from
  kind:0 metadata); rename, fill in payout, and publish at your
  own pace. Decision pinned in ADR
  [0014](decisions/0014-marketplace-open-to-all-logged-in-users.md).
- No CMS for landing content, page titles, branding, or copy.
  Those are code (SCSS, next-intl JSON, TS modules) — the
  creator surfaces only own offerings and per-user settings.
- No scheduling/calendar. Codes are redeemed in person; the
  seller's existing booking process is unchanged.
- No stock counts. Codes and downloads are infinite.
- No refunds, resends, or DM-from-the-UI in v1. Read-only over
  orders/buyers. Deferred to v1.1.
- No buyer-side wallet detection.
- No third payout rail. The two rails (Wapu ARS and direct sats
  to a Lightning Address) are pinned in ADR
  [0015](decisions/0015-sats-settlement-rail.md). Adding a third
  needs a superseding ADR.

If you find yourself reaching for any of the above, check the
ADRs first — the omission is probably deliberate.
