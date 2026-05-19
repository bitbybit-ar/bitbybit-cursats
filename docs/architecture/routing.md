# Routing

> **Status:** Active
> **Last updated:** 2026-05-19

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-19 | Static content | `/how-it-works` restyled: a fixed ambient bubble backdrop plus the two journeys as titled rows of reused `<Polaroid>` step cards (view-triggered stagger; no toggle, no scroll-scrub, no query param). Same single route, same i18n keys/content; no routing or data change. Components under `components/how-it-works/*`. | Presentational only; logged so contributors know it is one static page (not parameterised) before the visual layer churned. |
| 2026-05-19 | Conventions, Static content | Renamed the last two Spanish-slug public pages: `/como-funciona` → `/how-it-works`, `/caracteristicas` → `/features`. Clean pre-launch rename (no back-compat redirect — nothing links to the old slugs yet); reserved-slug list updated to the new names (plus `/faq`, previously missing). Updated the Features-page card list (dropped opt-in autorenewal and marketplace-or-self-host, which describe deferred/cut features per ADRs 0020 and 0014/0004; now one-shot + open marketplace) and the How-it-works glossary note (3 brand logos: Lightning / Wapu / Nostr). | ADR 0023: every public route is English/language-neutral; the "Spanish slug retained for share-link continuity" carve-out from ADR 0014 is moot pre-launch. The Features copy was advertising a deferred feature (autorenewal) and a retired model (per-merchant fork/self-host). |
| 2026-05-12 | Buyer flow, Conventions | Flattened seller URLs: `/[locale]/m/[userSlug]` → `/[locale]/[userSlug]` and `/[locale]/m/[userSlug]/c/[offeringSlug]` → `/[locale]/[userSlug]/c/[offeringSlug]`. Redesigned the offering detail page (hero + rail/delivery badges + instructor block) and wired the landing's mock courses (`lib/mock/highlighted-courses.ts`) as a fallback so the three demo URLs render without a populated DB. | ADR 0017. With merchants collapsed into users (ADR 0016) the `/m/` namespace no longer maps to a distinct concept; the offering page also needed real shape before the marketplace launches. |
| 2026-05-12 | — | Wholesale rewrite to match the actual `app/` tree. Replaced every Spanish creator slug (`/mis-cursos`, `/mis-ventas`, `/mis-estudiantes`, `/configuracion`, `/iniciar-sesion`, `/mis-compras`, `/gracias`, `/reclamar`) with its English equivalent under the `(logged-in)` route group. Replaced the obsolete `/api/admin/*` namespace with the actual `/api/my-courses` + `/api/settings` shape. Documented the three-generation redirect chain in `proxy.ts` (pre-0014 panel → 0014-era Spanish → final English). Removed routes that were aspirational but not implemented (`/api/admin/upload`, `/api/admin/orders`, `/api/admin/stats`, `/api/nip05/resolve`, `/[locale]/terminos`, `/[locale]/privacidad`). | The doc was documenting routes that no longer exist (`/mis-cursos`, etc. — now redirected) and routes that never existed in the form described (`/api/admin/*` was renamed). Contributors trying to call documented endpoints would have hit 404s. |
| 2026-05-09 | Conventions, Account, Panel, API, Not routed | Removed the `/panel/*` namespace; creator surfaces moved to top-level routes (`/mis-cursos`, `/configuracion`, `/mis-ventas`, `/mis-estudiantes`). Documented the legacy 308 redirects in `proxy.ts`. Recorded `/api/notifications`. | ADR 0014: every signed-in user is implicitly a creator; the merchant row is data, not a gate. |
| 2026-05-09 | Conventions, Buyer flow | Switched next-intl to `localePrefix: "as-needed"`. Spanish (default) is now served unprefixed (`/`, `/mis-cursos`, …) and English keeps the `/en` prefix. | Spanish is the primary audience; the `/es` prefix added a redirect hop and made every share/canonical URL a level deeper than necessary. As-needed gives Spanish the natural URL while preserving an unambiguous English surface. |
| 2026-05-09 | Static | Added `/como-funciona` and `/caracteristicas` rows. Corrected the FAQ row from `/preguntas` to `/faq` to match the implemented folder. | Three new public content pages shipped (How it works, Features, FAQ); the FAQ slug recorded here had drifted from the actual route, which would mislead contributors. |
| 2026-05-08 | Panel API | Removed `/api/admin/upload`; image uploads now go browser-direct to Blossom servers. | ADR 0011 pins Blossom for image storage. There is no server-side proxy, so the route does not exist; documenting it would mislead contributors into building one. |
| 2026-05-07 | Buyer flow | Renamed checkout segment from `[invoiceId]` to `[orderId]`. | Status polling lives at `/api/orders/[orderId]`; the order id is the opaque key the buyer carries from checkout to receipt; using the same name across all three surfaces removes a translation step for contributors. |
| 2026-05-06 | — | Initial version. | Pin the full route map (buyer, account, subscriber, static, panel, API) before app code lands so contributors do not have to reconstruct it from this conversation or scattered ADRs. |

---

## Table of Contents

1. [Conventions](#conventions)
2. [Buyer flow](#buyer-flow)
3. [Account](#account)
4. [Creator (signed-in)](#creator-signed-in)
5. [Subscriber (auto-renewal)](#subscriber-auto-renewal)
6. [Static content](#static-content)
7. [API routes](#api-routes)
8. [Special files](#special-files)
9. [Legacy redirects](#legacy-redirects)
10. [What is intentionally not routed](#what-is-intentionally-not-routed)

---

## Conventions

- All user-facing routes are scoped to `/[locale]/...` in the
  filesystem, but the wire shape is **as-needed**: Spanish
  (`es`, the default locale) is served **without** a locale
  prefix, and English (`en`, secondary) is served with `/en`.
  So `/[locale]/my-courses` resolves to `/my-courses` in Spanish
  and `/en/my-courses` in English. next-intl middleware redirects
  `/es/...` → `/...` and handles `Accept-Language`.
- **All logged-in routes are English** (`/my-courses`, `/orders`,
  `/settings`, `/create-course`, `/purchases`) and live under the
  `(logged-in)` route group. Public buyer routes also follow the
  English convention (`/explore`, `/sign-in`,
  `/receipt/[orderId]`, `/claim/[orderId]`). The static content
  pages are English too: `/how-it-works`, `/features`, `/faq`.
  The first two carried Spanish slugs (`/como-funciona`,
  `/caracteristicas`) until ADR
  [0023](decisions/0023-english-public-content-slugs.md)
  completed the rename. The platform is pre-launch (no external
  links to those slugs yet), so this was a clean rename with no
  back-compat redirect — unlike the buyer-route renames, which
  predate that decision and keep their 308s. Decision pinned in
  ADRs
  [0014](decisions/0014-marketplace-open-to-all-logged-in-users.md)
  and [0023](decisions/0023-english-public-content-slugs.md);
  reserved-slug list in `lib/admin/ar-bank-id.ts` blocks these
  route names from being claimed as a user slug.
- The storefront URL is `/[userSlug]` (ADR 0017). It used to nest
  under `/m/[userSlug]` for share-link continuity with the
  pre-merger merchant model (ADR 0016), but the marketplace had not
  shipped any production links yet, so the prefix was dropped before
  launch. The reserved-slug list in `lib/admin/ar-bank-id.ts` blocks
  any user from claiming a top-level route name, so the flattening
  cannot collide with `/explore`, `/settings`, etc.
- Dynamic segments use the shape that survives the longest:
  opaque ids for orders (`[orderId]`), human slugs for offerings
  (`[slug]` / `[offeringSlug]`), human slugs for sellers
  (`[userSlug]`), pubkeys for buyers where a buyer detail page
  exists.
- API routes live under `/api/...`, never under `/[locale]/api`.
  They are language-agnostic.
- Creator routes (`/my-courses`, `/create-course`, `/orders`,
  `/settings`, `/purchases`) are gated at the edge by `proxy.ts`:
  anonymous visitors bounce to `/sign-in?next=...`. There is no
  user-row gate — any signed-in user gets a placeholder user row
  lazily on first server-side need (`requirePanelUser` in
  `lib/admin/require-user.ts`). Decision pinned in ADR
  [0014](decisions/0014-marketplace-open-to-all-logged-in-users.md).

## Buyer flow

The critical path. Optimised for the buyer who lands cold,
clicks, pays, and walks away with a redemption code or download.

| Route | Purpose | Notes |
|---|---|---|
| `/` | Landing + catalog (Spanish) | Default locale, no prefix. |
| `/en` | Landing + catalog (English) | Secondary locale, prefixed. |
| `/[locale]` | Filesystem segment | Source-of-truth shape under `app/[locale]/...`; resolves to the unprefixed URL for `es` and to `/en/...` for `en`. |
| `/[locale]/explore` | Global catalog | Aggregated view across every active seller's offerings. |
| `/[locale]/[userSlug]` | Seller storefront | A single seller's listings. Slug auto-generated at sign-in (`user-<first-8>`); the seller can rename it from `/settings`. |
| `/[locale]/[userSlug]/c/[offeringSlug]` | Offering detail | Hero (image + title + price + CTA), rail/delivery badges, long description, instructor block with the seller's bio and a link to their storefront. `c/` keeps the offering slug namespaced under the seller so two sellers can both ship `intro-bitcoin`. |
| `/[locale]/checkout/[orderId]` | Lightning invoice | QR + copy-to-clipboard, status polling against `/api/orders/[orderId]`. Survives reload. If `users.features_autorenewal` is on for the seller, both pay-buttons (one-shot vs NWC) are visible — buyer self-selects. |
| `/[locale]/receipt/[orderId]` | Permanent receipt | Redemption code (`type=code`) or short-lived signed download URL (`type=download`). Inline "Conectá tu Nostr para guardar este pedido" prompt. Decision pinned in ADR [0006](decisions/0006-nostr-and-inapp-delivery.md). |

## Account

The account surface is unified per ADR
[0014](decisions/0014-marketplace-open-to-all-logged-in-users.md):
every signed-in user is implicitly a creator, so My purchases /
My courses / Settings / Sign out all share one navbar dropdown.
Anonymous purchases stay supported (ADR
[0007](decisions/0007-optional-nostr-buyer-login.md)).

### Sign-in

| Route | Purpose | Notes |
|---|---|---|
| `/[locale]/sign-in` | Nostr sign-in | NIP-07 / nsec / NIP-46. Module ported from bitbybit-arena. |
| `/[locale]/claim/[orderId]` | Claim a past anonymous order | Logged-in buyer pastes the `orderId` from a prior anonymous purchase to attach it to their pubkey. |

### Buyer-side

| Route | Purpose | Notes |
|---|---|---|
| `/[locale]/purchases` | My purchases | Logged-in only. Each row links back to `/receipt/[orderId]`; do not duplicate the receipt page under `/purchases/[orderId]`. |

## Creator (signed-in)

Any signed-in user gets these routes; a placeholder user row is
created lazily on first server-side hit. All of these live under
the `(logged-in)` route group in `app/[locale]/(logged-in)/...`.

| Route | Purpose | Notes |
|---|---|---|
| `/[locale]/my-courses` | My courses | Lists active and archived offerings owned by the user. |
| `/[locale]/create-course` | New course form | Creates an offering. Triggers placeholder-user lazy creation on first hit. |
| `/[locale]/my-courses/[slug]/edit` | Edit course | Same form as create, prefilled. Archive button lives on this page. |
| `/[locale]/orders` | Sales history | Read-only in v1. Filter, search, sort, paginate. |
| `/[locale]/orders/[orderId]` | Sale detail | Buyer pubkey if any, payment hash, rail (`wapu_ars` or `lightning`), Wapu settlement reference (Wapu rail) or LNURL verify URL (Lightning rail), redemption state. |
| `/[locale]/settings` | Settings | Slug, display name, bio, payout method (`wapu_ars` ⇒ CBU/alias; `lightning` ⇒ Lightning Address), autorenewal toggle. Mutations to payment-destination fields require a NIP-07 re-sign at save time; a new Lightning Address must pass a 1-sat LUD-21 probe before being accepted (ADR [0015](decisions/0015-sats-settlement-rail.md)). |

## Subscriber (auto-renewal)

Code paths are deployed but dormant unless the seller has
`features_autorenewal` on (amended ADR
[0005](decisions/0005-prepaid-default-autorenewal-optin.md)). The
subscriber-side surface is reserved but not yet shipped; this
table documents the expected shape so contributors building it
do not invent a different one.

| Route | Status | Purpose |
|---|---|---|
| `/[locale]/subscription` *(reserved)* | Not built | Manage NWC connection: next renewal date, spend cap, revoke. Own page (not a section of `/purchases`) because revoking NWC has different consequences than cancelling a one-shot order. |

## Static content

| Route | Purpose | Notes |
|---|---|---|
| `/[locale]/how-it-works` | How it works | Ambient-bubble backdrop; buyer journey + teacher journey each a titled row of three `<Polaroid>` steps; then static glossary (Lightning / Wapu / Nostr logos) + no-custody pitch + dual CTA. Single static page. Renamed from `/como-funciona` (ADR 0023, clean pre-launch rename — no redirect). |
| `/[locale]/features` | Features | 9-card grid: two-rails-payout, no custody, anonymous purchase, optional Nostr login, in-app delivery, instant Lightning payment, creator account, codes-or-downloads, open marketplace. Renamed from `/caracteristicas` (ADR 0023, clean pre-launch rename — no redirect). |
| `/[locale]/faq` | FAQ | Q&A entries covering Lightning, wallets, Wapu, Argentina-only (Wapu rail), anonymity, delivery, lost receipts, creator payouts, Nostr sign-in, and fees. |

## API routes

Language-agnostic. Routes that mutate state require the
appropriate session (buyer Nostr session for
`/api/orders/.../claim`, signed-in user session for
`/api/my-courses` and `/api/settings`).

### Public

| Route | Method | Purpose |
|---|---|---|
| `/api/wapu/webhook` | POST | Receives Wapu payment events. Signature-verified before any state change (CLAUDE.md rule). Refuses with 404 (no body) for any order whose `rail !== 'wapu_ars'`. |
| `/api/orders/[orderId]` | GET | Status polling for the checkout page. Public (the `orderId` is the access key). For Lightning-rail orders, also probes the seller's `lnurl_verify_url` (LUD-21) to detect settlement. |
| `/api/checkout` | POST | Creates an order + invoice for an offering. Dispatches on the seller's `payout_method`: Wapu invoice for `wapu_ars`, LNURL-pay callback for `lightning`. |
| `/api/downloads/[orderId]` | GET | Issues a short-lived signed URL for a download-type offering. Validates the `orderId` and the order's paid state. |
| `/api/zap/status` | GET | Backs the "Zap the devs" modal on the support section. |

### Auth (ported from bitbybit-arena)

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/nostr` | POST | Challenge / response: client signs a nonce, server verifies, issues a session, and materialises the user row via `ensureUserForPubkey` (seeded from the user's Nostr kind:0 metadata). |
| `/api/auth/session` | GET | Returns the current session (pubkey, exp, `user` summary: id, slug, display_name). |
| `/api/auth/signout` | POST | Clears the session cookie. |

### Buyer-scoped

| Route | Method | Purpose |
|---|---|---|
| `/api/orders/[orderId]/claim` | POST | Logged-in buyer attaches a past anonymous order to their pubkey. |
| `/api/notifications` | GET, PATCH, POST | List, mark-read, mark-all-read for the navbar bell. Returns 401 for anonymous callers; 30s polling from the bell with a tab-visibility pause. |

### Creator-scoped (signed-in user session)

| Route | Method | Purpose |
|---|---|---|
| `/api/my-courses` | GET, POST | List + create offerings for the signed-in user. |
| `/api/my-courses/[id]` | GET, PATCH, DELETE | Read, update, archive a single offering. |
| `/api/settings` | GET, PATCH | Read + update settings. CBU/alias/Lightning-Address updates require a NIP-07 re-sign payload; a new Lightning Address must pass a 1-sat LUD-21 probe before the PATCH succeeds. |

Image uploads do **not** ride a server route. Per ADR
[0011](decisions/0011-image-storage-via-blossom.md) the offering
form uploads directly from the browser to one or more Blossom
servers (`NEXT_PUBLIC_BLOSSOM_SERVERS`), authenticated by a
kind:24242 signed event produced via `signWithPrompt`. The
returned hash-addressed URL lands in `offerings.image_url`.

### Subscriber (only mounted when `features_autorenewal` is on)

The cron and NWC routes are reserved but not yet built; this
table documents the expected shape.

| Route | Method | Status | Purpose |
|---|---|---|---|
| `/api/cron/renew` | GET | Not built | Triggered by Vercel Cron daily; runs renewal pulls. |
| `/api/nwc/connect` | POST | Not built | Receives an NWC connection string from a subscribing buyer. |
| `/api/nwc/revoke` | POST | Not built | Buyer revokes the NWC grant from `/[locale]/subscription`. |

## Special files

| File | Purpose |
|---|---|
| `app/[locale]/layout.tsx` | Root layout, `generateMetadata`, theme provider, fonts. |
| `app/[locale]/(logged-in)/layout.tsx` | Layout for the signed-in routes (navbar account dropdown, etc.). |
| `app/[locale]/not-found.tsx` | 404. |
| `app/[locale]/error.tsx` | Error boundary. |
| `app/[locale]/opengraph-image.tsx` | Dynamic OG image per locale. |
| `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts` | SEO surface. |
| `proxy.ts` | Edge middleware: legacy 308 redirects + creator-route session gate + next-intl locale handling. |

## Legacy redirects

`proxy.ts` 308-redirects three generations of legacy paths to the
current canonical English routes. Order matters in
`rewriteLegacyPath`: longer prefixes are matched first.

### Pre-ADR-0014 (`/panel/*`)

| Legacy | Now |
|---|---|
| `/panel/configuracion` | `/settings` |
| `/panel/ofertas/nueva` | `/create-course` |
| `/panel/ofertas/[slug]/editar` | `/my-courses/[slug]/edit` |
| `/panel/ofertas` (any other) | `/my-courses` |
| `/panel/pedidos` (any) | `/orders` |
| `/panel/estudiantes` (any) | `/orders` |
| `/panel` (any other) | `/my-courses` |

### ADR-0014 era (Spanish top-level)

| Legacy | Now |
|---|---|
| `/mis-cursos/nueva` | `/create-course` |
| `/mis-cursos/[slug]/editar` | `/my-courses/[slug]/edit` |
| `/mis-cursos` (any other) | `/my-courses` |
| `/mis-ventas` (any) | `/orders` |
| `/mis-estudiantes` (any) | `/orders` |
| `/configuracion` (any) | `/settings` |
| `/onboarding` (any) | `/sign-in` |

### Public-route Spanish → English

| Legacy | Now |
|---|---|
| `/explorar` | `/explore` |
| `/iniciar-sesion` | `/sign-in` |
| `/gracias/[orderId]` | `/receipt/[orderId]` |
| `/reclamar/[orderId]` | `/claim/[orderId]` |

The locale prefix is preserved across the redirect (`/en/mis-cursos`
→ `/en/my-courses`).

## What is intentionally not routed

- **No password-reset, email-verification, or account-deletion
  flows.** Identity is Nostr; recovery is whoever holds the nsec.
- **No buyer-side wallet detection page.** Decision pinned in
  ADR [0005](decisions/0005-prepaid-default-autorenewal-optin.md).
- **No `/panel/*` namespace.** Removed in ADR
  [0014](decisions/0014-marketplace-open-to-all-logged-in-users.md);
  legacy paths 308-redirect via `proxy.ts`.
- **No forced `/onboarding` step.** Sign in with Nostr and you
  have a user row immediately. The legacy `/onboarding` URL
  308s to `/sign-in`.
- **No `/api/admin/*` namespace.** The "admin" prefix was
  retired with the panel; creator-scoped routes are
  `/api/my-courses` and `/api/settings` directly.
- **No `/api` versioning prefix in v1.** If we break a public
  contract (only `/api/wapu/webhook` and `/api/orders/[orderId]`
  qualify) we will add `/api/v2/...` at that time.
- **No refund, resend, or DM-from-the-UI routes in v1.** Those
  are write actions over orders/buyers, deferred to v1.1.
- **No legal pages routed yet** (`/[locale]/terminos`,
  `/[locale]/privacidad`). The slugs are reserved for when copy
  lands.
