# Architecture overview

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Offering types | Replaced the `download` type's "short-lived signed URL" description with the proxy's actual behavior: it serves the file behind a per-order fetch cap and post-payment expiry window (`lib/download-limits.ts`). | The download proxy gained access limits; the prior "signed URL" phrasing never matched the implementation. |
| 2026-05-24 | Creator surfaces | Dropped the "read-only in v1" qualifier from the `/orders` route row and relabeled the access-model bullet from "Read-only" to "No mutations" (the substance — orders/payments/buyers are immutable views — is unchanged). | The "read-only in v1" wording was surfaced to sellers as a meaningless UI hint and removed product-wide; the docs are aligned with that copy cleanup. |
| 2026-05-24 | SEO surface | `buildPageMetadata` now emits **exactly one** `og:image` per page: a page with its own `image` (course image / store banner) shows only that; a page without one falls back to the single localized `opengraph-image` brand card. Dropped the stacked `og.png` twin from the shared builder (`og.png` stays only as the inherited-layout fallback). | Stacking the page image plus both brand cards produced three `og:image` tags on course/store pages: WhatsApp showed the *last* (the fallback) instead of the course image, and Discord rendered all three. |
| 2026-05-24 | SEO surface | Redrew the OG image as one lockup (bigger stacked block mark beside a single giant `CURSATS` wordmark, no second small lockup) rendered in the brand display face (Nunito, vendored WOFF read via `fs`); added the shared `buildPageMetadata` helper in `lib/seo.ts` so every page carries the brand card under its own title/description (course pages and creator stores lead with their own image, brand card as fallback), and shortened the `metadata.description` so WhatsApp stops truncating it mid-sentence. `og.png` re-baked from the es route as the fallback. | The card duplicated the wordmark (small lockup + hero) and used Satori's fallback sans; nested pages either showed no card image or reused the home page's title/description because the `opengraph-image` file convention doesn't propagate to nested segments; the description was being cut off at "you choose how to get". |
| 2026-05-24 | Security | CSP moved from a static `next.config.ts` header to a per-request build in `proxy.ts` (`lib/csp.ts`): production `script-src` is now `'self' 'nonce-…' 'strict-dynamic'` with no `'unsafe-inline'`, the nonce stamped on Next's bootstrap scripts plus the inline JSON-LD and theme scripts; other security headers stay static. | Defense in depth (issue #32): removing `script-src 'unsafe-inline'` ensures an injected inline `<script>` can't execute even if a future HTML sink slips past the `react/no-danger` guard. |
| 2026-05-23 | Stack, Table of Contents, Payment flow | Corrected the exchange-rate source from Yadio to Wapu's `/exchange_rates` (ADR 0027 superseded 0022); fixed the staging API base to `be-stage.wapu.app` (`staging.wapu.app` is the web environment, not the API host); dropped the stale "server-side signing for outgoing DMs" from the Nostr line (no server signing key ships; in-app delivery per ADR 0006). Reconciled the Table of Contents with the body: removed the stale "Auto-renewal flow (optional)", "Notifications & delivery", "Configuration model", and "What is intentionally not here" entries (none exist as sections — notifications now lives as an H3 under Payment flow) and repointed the in-body delivery link to `#in-app-notifications`. | The Stack section still named Yadio, mislabeled the staging API base, and described a server-side DM signer that was removed; the TOC linked four sections that no longer exist as headings, and an in-body link pointed at the dead anchor. |
| 2026-05-22 | Identity model, Payment flow, Notifications & delivery, Configuration model, Security, Stack, Routing | Removed the Nostr-DM delivery channel and the paste-your-npub buyer tier (no server signing key ships); made both rails poll-driven (no Wapu webhooks) with a daily settlement cron + on-demand `/api/orders/sync`; dropped `NOSTR_NSEC`, `PLATFORM_ADMIN_PUBKEYS`, and NWC from the config table, security list, and identity model. | The server Nostr-DM, platform-admin moderation, and NWC/auto-renewal env vars were removed as dead code, and the Wapu rebuild (ADR 0025) made the rail poll-driven; the overview still described webhooks, DMs, and those env vars. |
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
10. [Security](#security)

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
download link. The receipt page is the only delivery channel — no
emails, no DMs — so buyers save the URL. Buyers may optionally sign
in with Nostr to see their full order history at
`/[locale]/purchases`; purchase never requires it.

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

The checkout API dispatches on `users.payout_method`. Neither rail
uses webhooks: a `wapu_ars` order polls its Wapu deposit transaction
and a `lightning` order polls the seller's `lnurl_verify_url`, both
from `/api/orders/[orderId]`. The `wapu_ars` seller payout leg is
settled by a daily cron (`/api/cron/wapu-settlements`); sellers can
also trigger it on demand from `/orders`.

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
  payment status. Production API base
  `https://be-prod.wapu.app`; staging API base
  `https://be-stage.wapu.app` (the `staging.wapu.app` environment
  uses fake money). Auth header is
  `X-API-Key`. The public source of the API contract is
  <https://github.com/wapu-app/wapu-cli> until Wapu publishes
  formal docs; the relevant endpoints are `POST
  /wallet/deposit_lightning` (Lightning invoice), `GET
  /transactions/{id}` (status), and `POST /transactions/create`
  (ARS withdrawal as a `fiat_transfer`).
- **Wapu `/exchange_rates`** — the live sats↔ARS rate shown across
  the storefront is derived from Wapu's `/exchange_rates`
  (buy USDT/ARS × buy BTC/USD), so it reuses `WAPU_PAY_APU_HOST` +
  `WAPU_API_KEY` with no separate service or env var. Read through
  the single `lib/exchange-rate.ts:getSatsPerArs()` seam with a
  5-minute cache → last-good → static fallback chain. Decision in
  ADR [0027](decisions/0027-exchange-rate-from-wapu.md), superseding
  the Yadio source of ADR
  [0022](decisions/0022-live-exchange-rate-via-yadio.md).
- **Nostr** — client-side only (`nostr-tools` + `@noble/secp256k1`):
  NIP-07 / nsec / NIP-46 for buyer/seller login (ADRs
  [0007](decisions/0007-optional-nostr-buyer-login.md) /
  [0014](decisions/0014-marketplace-open-to-all-logged-in-users.md)),
  an optional buyer identity pasted at checkout, and a per-mutation
  re-sign at save time on payment-destination fields (CBU / alias /
  Lightning Address) in `/settings`. No server signing key ships and
  there is no Nostr-DM channel — delivery is the in-app receipt (ADR
  [0006](decisions/0006-nostr-and-inapp-delivery.md)).
- **`jose`** — signs the session JWT held in an httpOnly cookie.
- **Vercel** — Hobby plan; a daily Vercel Cron
  (`/api/cron/wapu-settlements`) settles the Wapu ARS payout leg.

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
/[locale]/settings               → payout method, slug, display name

/api/orders/[orderId]            → order status (polls Wapu deposit / LN verify)
/api/orders/sync                 → seller-triggered settlement sweep
/api/cron/wapu-settlements       → daily Wapu payout settlement (cron)
/api/auth/*                      → Nostr session
/api/my-courses, /api/settings   → seller-scoped CRUD
/api/notifications               → navbar bell
```

Legacy paths (pre-ADR-0014 `/panel/*` and the ADR-0014-era
Spanish slugs) 308-redirect via `proxy.ts`. See
[`routing.md`](routing.md) for the rest, conventions, and the
rationale for each slug.

## Identity model

Two buyer identity tiers (ADR
[0007](decisions/0007-optional-nostr-buyer-login.md)):

1. **Anonymous.** Pay, land on `/receipt/[orderId]`, get the
   code, walk away. The opaque URL is the only access key — and the
   only delivery channel.
2. **Logged-in via Nostr.** NIP-07 / nsec / NIP-46 sign-in
   issues a `jose` JWT in an httpOnly cookie. Orders link to the
   session pubkey; `/[locale]/purchases` lists them. The same
   sign-in materialises the user row (`ensureUserForPubkey`) so the
   same identity also unlocks the creator surfaces.

## Creator surfaces

Any signed-in user can reach the creator surfaces; the user row is
created lazily on first hit (`requirePageUser` in
`lib/creator/require-user.ts`). There is no `/panel/*` namespace
(removed in ADR
[0014](decisions/0014-marketplace-open-to-all-logged-in-users.md))
— creator pages are top-level English routes inside the
`(logged-in)` route group:

| Route | Purpose |
|---|---|
| `/[locale]/my-courses` | List + archive of the user's offerings |
| `/[locale]/my-courses/[slug]/edit` | Edit offering, archive button lives here |
| `/[locale]/create-course` | New offering form |
| `/[locale]/orders` | Sales history |
| `/[locale]/orders/[orderId]` | Sale detail (rail, deposit/withdrawal tx, payout status, redemption) |
| `/[locale]/settings` | Payout method (Wapu CBU/alias OR Lightning Address), slug + display name |

- **Auth.** Edge gate in `proxy.ts` requires a signed-in session;
  anonymous visitors bounce to `/sign-in?next=...`. Server-side,
  each page's `requirePageUser` materialises the user row on
  first hit.
- **Write**: offerings (full CRUD), settings (CBU, alias,
  Lightning Address, payout method).
  Mutations to payment-destination fields (CBU, alias, Lightning
  Address) require a NIP-07 re-sign at save time, so a stolen
  session cookie cannot quietly redirect future settlement.
- **No mutations**: orders, payments, and buyers are views — a
  completed sale is an immutable record, with no edit, refund, or
  resend action over it.
- **Audit log.** Every mutation writes a row to
  `admin_audit_log` (column `user_id` since ADR 0016).

Routes inventory and request shapes live in
[`routing.md`](routing.md).

## SEO surface

- Per-locale `generateMetadata` in `app/[locale]/layout.tsx`
  produces title, description, keywords, OG, Twitter, robots,
  canonical, and `hreflang` alternates for the home page. Every
  other page builds its metadata through `buildPageMetadata` in
  `lib/seo.ts`, which emits **exactly one** `og:image` per page
  under its **own** per-page title and description. A page that
  passes an optional `image` (a course image / store banner) shows
  only that image; a page without one falls back to the single
  localized brand card (the `opengraph-image` route). Emitting more
  than one `og:image` breaks sharing — WhatsApp picks the *last*
  tag and Discord renders *every* tag — so the helper never stacks
  the page image and the brand card. The helper exists
  because the `opengraph-image`
  file convention does not propagate to nested route segments, and
  a page that sets its own `openGraph` block otherwise drops the
  inherited image — so without it, nested pages either showed no
  card image or reused the home page's title/description. The
  canonical and alternates use the same `lib/seo.ts` helpers.
- `Organization` and `WebSite` JSON-LD are injected in the
  `<head>` from the layout. The `Organization` block sets
  `parentOrganization` to BitByBit so search engines associate
  Cursats with the wider org.
- Dynamic OG image rendered per locale via `next/og` at
  `app/[locale]/opengraph-image.tsx`. It is brand-led and reads as
  a single lockup: the vertically stacked block mark sitting beside
  one giant `CURSATS` wordmark (the same blue/lime/pink hues as
  `<LogoBlocks />` / `<Wordmark />`) — there is no second small
  lockup; the hero *is* the logo. One short value line sits below
  from `messages/{locale}.json` (`metadata.ogValueLine`). The
  wordmark renders in the brand display face (Nunito): the WOFF
  files are vendored under `app/[locale]/_fonts/` and read into
  Satori with `fs` at request time (Satori can read neither the
  SCSS tokens nor WOFF2). That value line is the brand slogan
  ("Cursá tu próxima clase con sats" / "Your next class, paid in
  sats"), which also doubles as the link title
  (`metadata.siteTitle`); the long product description stays out of
  the image and lives only in the link description. `public/og.png`
  is a baked twin of the **default-locale (es)** route. It is the
  `og:image` only for routes that inherit the layout metadata
  without setting their own `openGraph` (the account and sign-in
  pages); shared content pages emit a single image via
  `buildPageMetadata`. Regenerate it (`curl …/opengraph-image >
  public/og.png`) whenever the route's design changes.
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
   code. The buyer shows the code to the seller in person. Used for
   single classes, lesson packs, monthly bonos.
2. **`download`** — buyer pays, the receipt page shows a download
   button served by a proxy (`/api/downloads/[orderId]`) that keeps
   the private file behind a per-order fetch cap and a post-payment
   expiry window (`lib/download-limits.ts`). Used for PDF method
   books, sheet music, recorded course material.

Both share: catalog → invoice (Wapu or LNURL-pay) → confirmation
(poll the Wapu deposit or the LUD-21 verify URL) → receipt page.
The receipt content is the only difference.
See [In-app notifications](#in-app-notifications) for the
delivery model in detail.

## Payment flow

The buyer always pays in sats over Lightning; the path the sats
take from there depends on which rail the seller picked in
`/settings`.

### Rail = `wapu_ars` (sats → ARS to seller's CBU)

```text
Buyer              Cursats app             Wapu              Seller bank
  │                    │                   │                     │
  │── click Pay ──────▶│                   │                     │
  │                    │── deposit_lightning ▶                   │
  │                    │◀── BOLT11 + tx id ─│                     │
  │◀── show QR + amt ──│                   │                     │
  │── pay invoice (LN) ────────────────────▶                     │
  │                    │── poll deposit tx ▶│                     │
  │                    │◀── Completed ──────│                     │
  │◀── receipt + code ─│                   │                     │
  │                    │── open withdrawal ▶│                     │
  │                    │   (cron polls it)  │── ARS payout ──────▶│
```

Leg 1 (deposit) credits USDT to our Wapu wallet; the checkout page
polls the deposit transaction via `/api/orders/[orderId]` until it
reads `Completed`. Leg 2 (withdrawal) opens once the deposit
confirms and is polled to settlement by the daily cron. There are
no webhooks. Decision in ADR
[0025](decisions/0025-wapu-poll-driven-two-leg-rail.md).

### Rail = `lightning` (direct sats to seller's Lightning Address)

```text
Buyer              Cursats app          Seller's LNURL provider
  │                    │                       │
  │── click Pay ──────▶│                       │
  │                    │── LNURL-pay callback ▶│
  │                    │◀── invoice + verify ──│
  │◀── show QR + amt ──│                       │
  │── pay invoice (LN) ────────────────────────▶  (sats land in seller's wallet)
  │                    │── poll verify URL ───▶│
  │                    │◀── settled = true ────│
  │◀── receipt + code ─│                       │
```

The seller's LNURL-pay `verify` URL (LUD-21) is the source of
truth on this rail; `/api/orders/[orderId]` polls it.

Once confirmed, the buyer is redirected to their permanent receipt
page at `/[locale]/receipt/[orderId]` — the only delivery channel.

### In-app receipt page

Every paid order has a permanent receipt page at
`/[locale]/receipt/[orderId]` where `orderId` is an opaque,
unguessable identifier. It renders the redemption code (for
`code` offerings) or a short-lived signed download URL (for
`download` offerings) plus the order summary.

It does not depend on the buyer providing any identity: buyers save
the URL or screenshot the code at checkout. For expiring lesson
packs, the storefront UI can show "Renová tu bono" CTAs to bring
them back.

### In-app notifications

Order and payout events surface in the navbar bell — a Postgres
table polled by `/api/notifications`: `order.paid` /
`sale.received` when a deposit confirms, and `payout.pending` /
`payout.released` / `payout.failed` as the seller's ARS withdrawal
settles. These reach signed-in users only.

## Security

- HTTPS via Vercel, HSTS preload set.
- The Wapu API key + host, the `CRON_SECRET`, the session JWT
  signing key, and the Postgres connection string all live in
  Vercel environment variables. Never reach the client.
- Both rails are confirmed by polling, never a webhook. The
  settlement cron is guarded by a `CRON_SECRET` bearer token; the
  manual sync endpoint (`/api/orders/sync`) requires a signed-in
  session.
- Signed download URLs expire after 24 hours and are single-use.
- Receipt-page `orderId`s are opaque, unguessable identifiers
  (≥128 bits of entropy). Knowing one order's URL does not let
  you enumerate other orders.
- The buyer session is a `jose`-signed JWT held in an httpOnly,
  Secure, SameSite=Lax cookie. It carries the pubkey and an
  expiry; never a private key.
- The edge middleware in `proxy.ts` requires a signed-in session
  for every creator surface (`/settings`, `/my-courses`,
  `/create-course`, `/orders`, `/purchases`); anonymous visitors
  bounce to `/sign-in?next=...`. Server-side, each page's
  `requirePageUser` resolves (or lazily creates) the user row.
  Inactive users (the `users.active` flag) 404 instead of
  rendering.
- Updates to payment-destination fields (CBU, alias, Lightning
  Address) require a NIP-07 re-sign at save time. A stolen
  session cookie alone cannot redirect future settlement to an
  attacker's bank or wallet. A new Lightning Address must pass a
  1-sat LUD-21 probe before it is accepted.
- Every creator-side mutation writes a row to `admin_audit_log` —
  timestamp, actor pubkey, route, action, payload diff (secrets
  redacted). Read-only forever; there is no UI to delete rows.
- All external links use `target="_blank" rel="noopener noreferrer"`.
- CSP is built per request in `proxy.ts` (`lib/csp.ts`) so it can
  carry a unique nonce — `default-src 'self'`; production scripts are
  `'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'`, so an
  injected inline `<script>` is refused), with the nonce stamped on
  Next's bootstrap scripts and the inline JSON-LD + theme scripts;
  development keeps `'unsafe-inline' 'unsafe-eval'` for fast-refresh.
  Images from `https:` and `data:`; fonts from `fonts.gstatic.com` and
  styles from `fonts.googleapis.com` are allowed for
  `next/font/google`. The other security headers (HSTS, X-Frame-
  Options, nosniff, …) stay static in `next.config.ts`. The Wapu
  invoice QR is generated client-side; no third-party QR service is
  loaded.
