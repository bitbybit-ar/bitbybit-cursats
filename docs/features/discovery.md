# Discovery

> **Status:** Active
> **Last updated:** 2026-05-21

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — describe the three discovery surfaces, the tag system, the exchange-rate display, and the SEO surface. |

---

## Table of Contents

1. [Three surfaces](#three-surfaces)
2. [The global catalog — `/explore`](#the-global-catalog--explore)
3. [Seller storefront — `/<userSlug>`](#seller-storefront--userslug)
4. [Offering detail — `/<userSlug>/c/<offeringSlug>`](#offering-detail--userslugcofferingslug)
5. [Tag chips and filtering](#tag-chips-and-filtering)
6. [Exchange-rate display](#exchange-rate-display)
7. [Anonymous-by-default browsing](#anonymous-by-default-browsing)
8. [SEO surface](#seo-surface)

---

## Three surfaces

A buyer can find an offering through one of three public
surfaces — all of them work without signing in:

1. **`/explore`** — the global catalog. Lists every active
   (non-archived) offering across every seller.
2. **`/<userSlug>`** — a seller's storefront. Lists every active
   offering by that seller.
3. **`/<userSlug>/c/<offeringSlug>`** — a single offering's
   detail page, the surface where the buyer clicks Pay with sats.

All three are server-rendered for the public posture (no
client-side login required to load them) and carry per-locale
metadata.

## The global catalog — `/explore`

The top-level discovery surface for buyers who do not yet know
which seller they are looking for. It renders:

- A grid of offering cards (image, title, seller, price in sats
  and ARS).
- A search field that matches against the offering title and
  description.
- Tag chips that filter the grid by selected tag (see [Tag chips
  and filtering](#tag-chips-and-filtering)).
- The seller display name on each card, linked through to the
  seller's storefront.

When a signed-in buyer opens `/explore`, the order of the cards
is personalised by `lib/recommendations.ts` (served through
`app/api/recommendations/route.ts`), which scores offerings
against signals like the tag set the buyer engages with — the
GIN index on `offerings.tags` powers the `tags && $signal`
query. The precise scoring is an evolving surface; read it
straight from `lib/recommendations.ts`. Filter/sort query
parsing lives in `lib/explore-params.ts`. The deterministic
anonymous order is recency-weighted: newer offerings float
toward the top.

## Seller storefront — `/<userSlug>`

The seller's own public page. Renders:

- The seller's display name, avatar, and bio.
- A list of every active offering they own, in their own
  order.
- A link to the explore page filtered to their tags (if any
  overlap with the global tag set).

Storefront URLs are deliberately short — no `/m/` prefix, no
locale prefix when the locale is the default Spanish (so a
seller can promote `cursats.bitbybit.com.ar/pianoba` on paper or
in WhatsApp without it feeling like a URL designed by lawyers).

The reserved-slug list in `lib/admin/ar-bank-id.ts` prevents
users from claiming any top-level route name (`c`, `m`,
`explore`, `settings`, etc.), so the storefront URL can sit
flat at the root without ever colliding with an app route.

Decision in ADR
[0017-flatten-seller-urls](../architecture/decisions/0017-flatten-seller-urls.md).

## Offering detail — `/<userSlug>/c/<offeringSlug>`

The page a buyer lands on when they click a card. Renders:

- The offering image, title, description.
- The price in both sats and ARS (with the live conversion
  badge — see below).
- The seller's display name and avatar, linked through to their
  storefront.
- A clear Pay with sats button — the only mutation a buyer takes from
  this surface. The button is enabled for everyone (no sign-in
  required); a signed-in buyer's pubkey is attached to the order
  automatically, an anonymous buyer can optionally connect one
  in the next step.

## Tag chips and filtering

Each offering carries free-form tags (lower-cased, deduped). On
the public surfaces, tags become filter chips:

- On `/explore`, clicking a chip filters the grid to offerings
  carrying that tag; clicking it again clears the filter.
- On a storefront, the tag chips list the *seller's* tags only
  and link out to `/explore?tag=<tag>` so the buyer can find
  similar offerings across other sellers.
- The URL carries the active tag as a `?tag=` query param, so a
  filtered view is shareable and back/forward navigation works
  the same as any browser navigation.

The tag set is freeform rather than a curated taxonomy — sellers
write their own. Discovery improves with usage, not with an
ontology committee.

Decision in ADR
[0024-offering-tags](../architecture/decisions/0024-offering-tags.md).

## Exchange-rate display

Every price-bearing surface shows both **sats** and **ARS** side
by side. The conversion uses the live Wapu exchange rate (see
[settlement-rails — exchange rate](./settlement-rails.md#exchange-rate-display-only)
for the rate plumbing).

Why both, all the time. A piano teacher pricing in pesos and a
sats-native buyer reading the same card see the unit they think
in *and* the unit the rail settles in. The cost is one extra
line of text per card; the value is that nobody has to do mental
arithmetic.

The rate is cached for 5 minutes server-side, so a flurry of
page loads does not stampede Wapu. On a Wapu outage, the
storefront falls back to the last-good cached rate, then to a
conservative static fallback — the page never displays "—" for
the converted price.

## Anonymous-by-default browsing

None of the discovery surfaces require a session. A buyer can
land on `/explore`, click into an offering, click Pay with sats, pay,
and walk away with their code — all without ever seeing a
sign-in prompt. The session prompt is reserved for surfaces that
genuinely need an identity: `/my-courses`, `/create-course`,
`/orders`, `/settings`, `/purchases`.

A signed-in buyer's browsing experience is identical *plus* a
personalised order on `/explore` and a navbar avatar with the
bell. They never *have* to sign in to buy.

This anonymous-first posture is the same one ADR
[0007-optional-nostr-buyer-login](../architecture/decisions/0007-optional-nostr-buyer-login.md)
locked in for the buyer surface.

## SEO surface

The discovery surfaces are the primary thing Cursats wants
search engines and link-preview generators to find. The SEO
plumbing for that lives in the app shell, not in this feature
folder, but it shows up on every discovery surface:

- **`generateMetadata`** in `app/[locale]/layout.tsx` produces
  per-locale title, description, OG, Twitter, robots, canonical,
  and `hreflang` alternates.
- **JSON-LD** — `Organization` and `WebSite` blocks in `<head>`,
  with `parentOrganization` set to BitByBit so search engines
  associate Cursats with the wider org.
- **Dynamic OG image** rendered via `next/og` at
  `app/[locale]/opengraph-image.tsx`. Headline and tagline come
  from `messages/{locale}.json`.
- **`app/sitemap.ts`** lists `/es` and `/en` with hreflang
  alternates so search engines crawl both locales.
- **`app/robots.ts`** allows everything except `/api/` and
  `/_next/`.
- **`app/manifest.ts`** declares the standalone PWA shell.

Per-offering and per-storefront metadata extends these defaults
via the route's own `generateMetadata`, so a shared offering URL
in WhatsApp renders with the offering title, description, and
image — not a generic site preview.
