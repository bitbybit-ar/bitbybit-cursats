# Changelog

All notable **product** changes to BitByBit Cursats live here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

> **Note** — per-document edits live inside each doc's own
> `## Change Log` section (see `docs/_template.md`). This file is for
> product releases only.

## [Unreleased]

### Added

- **Inline validation for the CBU/alias payout fields.** The payout
  form now checks CBU (22 digits) and alias (BCRA 6–20 chars of
  letters/numbers/dots/hyphens, at least one letter) on blur and on
  submit, showing a specific message under the field instead of only a
  generic failure after a server round-trip. Uses the same validators
  as the server (`checkCbu`/`checkAlias`) so client and server agree,
  and applies in the create-course payout-setup modal too (same
  embedded form).
- **Payout speed setting for the Wapu rail.** Sellers paying out to a
  CBU/alias choose **Standard** (`fiat_transfer`, lower fee) or
  **Fast** (`fast_fiat_transfer`, higher fee) in `/settings`. Stored
  on `users.transfer_speed` and snapshotted onto each order.
- **Seller payout notifications.** The bell now surfaces
  `payout.pending` (ARS withdrawal opened), `payout.released` (pesos
  settled to the bank), and `payout.failed`.
- **Minimum course price on the Wapu rail.** Wapu rejects fiat
  withdrawals under 10 000 ARS, so an ARS course's net payout
  (price − fee) must clear that floor. The create-course form blocks
  submission and `POST`/`PATCH /api/my-courses` reject
  `price_below_wapu_minimum` otherwise (`WAPU_MIN_NET_ARS` in
  `lib/wapu-limits.ts`). Decision folded into ADR
  [0026](docs/architecture/decisions/0026-price-currency-follows-payout-rail.md).
- **One-tap mobile sign-in with your Nostr app.** On phones and
  tablets, the NIP-46 sign-in flow now leads with an "Open in your
  signer app" button that hands the `nostrconnect://` link straight
  to an installed signer (Amber, Primal, nsec.app, …) — no scanning
  your own screen, no copy-pasting a bunker URL, no exposing your
  `nsec`. The QR drops to an "Or scan from another device" fold and
  the desktop-only browser-extension button is hidden on mobile. The
  relay handshake and the NIP-98 server contract are unchanged; this
  is a mobile-first re-presentation of the existing remote-signer
  flow. Decision in ADR
  `docs/architecture/decisions/0025-mobile-login-via-nostrconnect-deep-link.md`.
- **Redesigned seller profile header.** The storefront header
  (`/[userSlug]`) now shows the avatar, name, NIP-05 with a verified
  badge, bio, a **Send a zap** button (zaps the seller's Lightning
  address via the existing zap modal), a **View on njump.me** link, and
  a **QR button** opening a two-tab popup (npub identity / Lightning
  address) with copy buttons. Content sits over the banner with a dark
  overlay for legibility. NIP-05 and the Lightning fallback come from
  the seller's kind:0 metadata; the settings Lightning address wins.
- **Notifications in the mobile menu.** On phones the bell now opens a
  notifications panel inside the slide-in drawer (with a back arrow),
  instead of a dropdown that was clipped off-screen. Desktop keeps its
  dropdown; both share one `useNotifications` hook + `NotificationList`.
- **Payout notification toggles.** The Preferences tab now exposes
  toggles for `payout.pending`, `payout.released`, and `payout.failed`
  alongside the existing buyer/sale toggles, so ARS (Wapu) sellers can
  manage the sale → transfer-released → failed pings.
- **Per-course sales on My courses.** Each active course shows its paid
  sales count and a "View sales" link to its orders
  (`/orders?course=<slug>`); the Orders page filters by that course.

### Changed

- **Tooltips no longer overflow the screen on mobile.** The shared
  `Tooltip` popover now measures itself when it opens and nudges back
  inside the viewport (with the arrow staying over the trigger), and
  its width is capped to the screen. Fixes `?` tooltips on left-aligned
  labels (e.g. the create-course form) clipping off-screen on phones.
- **Course pricing adapts to the seller's payout state.** The Pricing
  section now handles three cases explicitly: with no payout method
  configured it hides the price field (the currency is undefined until
  a rail is chosen) and shows a "Set up payment method" button that
  opens the inline payout-setup modal; on the Wapu (CBU/alias) rail it
  prices in ARS with the live fee/net estimate and minimum-net check;
  on the Lightning rail it prices in sats. Publish stays disabled
  until a payout method exists.
- **Create/edit course form now fills the container width.** The form
  was capped at 960px and left-aligned, leaving a lopsided gap on the
  right next to the full-width page header. It now spans the full
  container; Title and Slug pair into a two-column row, the price
  input sits beside its currency note and live fee/net estimate, and
  the code-count input is width-capped so short fields don't stretch.
  Long fields (description, tags, download URL, cover) stay
  full-width. All panes collapse to a single column on mobile.
- **Rich landing animations now run on tablets and small laptops.**
  The card-deck deal (Features) and the pinned scroll-journey
  (How-it-works) were gated at a 1024px CSS-pixel viewport, so a
  desktop-class laptop rendering below that width (OS display scaling,
  browser zoom, or a non-maximized window) saw only the simplified
  fade fallback. All landing animations now gate on a single axis —
  the layout's mobile breakpoint (768px) — so every non-phone width
  gets the same animation as desktop. The highlighted-courses grid
  reveal also moved from pointer-type to viewport-width detection, so
  a tablet or touchscreen laptop gets the desktop slide-in rather than
  the phone fade-up.
- **Settings: Notifications folded into Preferences.** The standalone
  Notifications tab is gone; its toggles now live under **Preferences**
  with a single Save. The informational "Theme" block was removed
  (theme is device-only via the navbar toggle), the language selector
  is full-width, and the Danger-zone description was reworded to make
  clear it removes your CURSATS data only (Nostr identity and relay
  events are out of our control).
- **FAQ accordion is single-open.** Opening a question now collapses
  the previously open one (all screen sizes).
- **Mobile polish.** Highlighted-courses cards fade up on mobile
  instead of sliding in from the left; landing sections, How-it-works,
  and the FAQ get consistent left/right gutters (the FAQ page now uses
  the `Container` component); the NIP-46 sign-in timeout was raised to
  120s so slower mobile relays don't trip a premature error; the
  desktop-only "Nostr WoT extension" hint is hidden on phones; the
  empty My-purchases "Browse the catalog" button was removed (the
  bottom "Explore more" CTA already covers it).
- **Create-course pricing copy.** The pricing section and tooltip no
  longer imply you pick a currency — they explain the price currency
  follows your payout method and point to Settings to change it.
- **Storefront exchange rate now comes from Wapu.** The sats↔ARS rate
  is derived from Wapu's `/exchange_rates` (buy USDT/ARS × buy
  BTC/USD) instead of Yadio, so the displayed estimate and the deposit
  sizing match the rail that settles the order. The `EXCHANGE_RATE_API_URL`
  env var is removed; the 5-min cache + last-good + static fallback are
  unchanged. Decision in ADR
  [0027](docs/architecture/decisions/0027-exchange-rate-from-wapu.md),
  superseding ADR
  [0022](docs/architecture/decisions/0022-live-exchange-rate-via-yadio.md).
- **Course price currency now follows the payout rail.** CBU/alias
  sellers price in ARS, Lightning-Address sellers price in sats — the
  free per-course currency picker is gone. On the ARS rail the seller
  bears the Wapu fee and the create-course form previews it live
  ("estimated fee ~X · you receive ≈ Y") via `/api/payout-quote`; the
  withdrawal pays the net. Decision in ADR
  [0026](docs/architecture/decisions/0026-price-currency-follows-payout-rail.md),
  superseding ADR
  [0019](docs/architecture/decisions/0019-pricing-currency-picker.md).
- **Wapu rebuilt as a poll-driven, two-leg rail (no webhooks).** A
  Lightning deposit credits our USDT wallet; once it confirms we open
  a fiat withdrawal to the seller's CBU/alias, polled to completion by
  a new Vercel Cron (`/api/cron/wapu-settlements`, guarded by
  `CRON_SECRET`). Both rails now settle by polling
  `/api/orders/[orderId]`. New env: `WAPU_PAY_APU_HOST`. Decision in
  ADR
  [0025](docs/architecture/decisions/0025-wapu-poll-driven-two-leg-rail.md).
- **Wapu client has no mock fallback — it fails loud.**
  `getWapuClient()` always builds the real client and throws when
  `WAPU_API_KEY`/`WAPU_PAY_APU_HOST` are missing, so a misconfigured
  deploy errors instead of silently faking payments. The in-process
  mock is gone; the integration is verified by two gated real-staging
  smoke tests (create-order → deposit invoice → `Pending`; open
  withdrawal → reaches the live endpoint), and order-lifecycle tests
  seed order rows directly.
- **Social preview image redesigned.** The Open Graph card
  (`app/[locale]/opengraph-image.tsx` and the static
  `public/og.png` fallback) now leads with the brand: vertically
  stacked blue/lime/pink blocks and the `CURSATS` wordmark
  (matching `<LogoBlocks />` / `<Wordmark />`), a giant wordmark
  hero, and the brand slogan as its value line. The old card
  burned a long headline and tagline into the image, which then
  repeated verbatim in the link title and description; the long
  product description now lives only in the link description. New
  `metadata.ogValueLine` key replaces the unused
  `ogHeadline`/`ogTagline` keys in both locales.
- **Brand title + slogan.** Dropped the "BitByBit" prefix from
  `metadata.siteName` and `metadata.siteTitle` in both locales —
  the link title, the `%s · …` sub-page suffix, and `og:site_name`
  now read "CURSATS" (uppercase, matching the wordmark) rather
  than "BitByBit Cursats". The title's
  tagline is now the slogan "Cursá tu próxima clase con sats" (es)
  / "Your next class, paid in sats" (en), the same line shown in
  the OG image. The Organization JSON-LD still carries the full
  name with `parentOrganization: BitByBit`, so the org
  relationship is preserved for search engines.

### Removed

- **Wapu webhook route + `WAPU_WEBHOOK_SECRET`.** Wapu has no webhook
  product; `/api/wapu/webhook` and the HMAC verifier are gone,
  replaced by polling (see the Changed entry above). Supersedes the
  unreleased "webhook secret fails fast in production" hardening below.

- **"Your money, your keys" custody section removed from
  how-it-works.** The claim that Cursats never holds the funds was
  inaccurate: for the Wapu rail, a buyer's sats land in the Cursats
  Wapu account and sit there until Wapu settles pesos to the
  teacher's CBU, so there is a window where the platform custodies
  the funds. Removed the section markup, its styles, and the
  `howItWorks.custody` i18n keys in both locales rather than ship a
  misleading guarantee.

- **`users.features_autorenewal` column dropped.** Migration
  `0010_drop_features_autorenewal.sql` removes the column from
  Postgres; `UpdateUserProfileSchema` no longer accepts the field
  and the PATCH response no longer surfaces it. ADR
  [0020](docs/architecture/decisions/0020-defer-autorenewal-from-mvp.md)
  was revised in the same pass: the original "keep the column,
  drop only the UI" posture was replaced with an outright drop.
  Re-introducing autorenewal will need a fresh migration.

### Security

- **Download proxy restricted to https.** The offering schema's
  `download_url` field now rejects `javascript:`, `data:`,
  `file:`, and bare http; the `/api/downloads/[orderId]` route
  re-parses the URL and refuses a 302 to anything that isn't
  https. Closes the post-purchase phishing/credential-theft
  vector flagged in the security audit.
- **LUD-21 probe runs on every Lightning-Address change.**
  `/api/settings` previously skipped the 1-sat probe when the
  user updated only their LN address without flipping
  `payout_method`; the gate is now driven entirely by whether
  the address changed, so the next rail flip cannot activate an
  unverified provider.
- **LNURL responses capped at 64 KiB.** `fetchJsonWithTimeout`
  (the shared helper used by the LNURL metadata, callback, and
  LUD-21 verify polls) now streams the response and aborts past
  the cap. The previous timeout-only guard would not stop a
  fast-but-huge response from exhausting worker memory.
- **NIP-98 replay window tightened from 30 s to 10 s.**
  `lib/nostr/verify.ts` halves the time a captured auth event
  stays usable. A residual replay risk inside the 10 s window
  remains; closing it fully requires a single-use-nonce store
  and is deferred.
- **JSON-LD output hardened against script-tag injection.**
  `app/[locale]/layout.tsx` now escapes `</script` and `<!--`
  sequences before embedding the schema.org payloads, so a
  future contributor passing user data into the markup cannot
  break out of the `<script>` island.
- **Wapu webhook 500 responses no longer leak error detail.**
  The internal exception message stays in the server log; the
  HTTP body is `{ error: "internal_error" }` so a caller probing
  with forged-but-signed payloads cannot infer schema or
  order-state from the response.

### Accessibility

- **`.size-sm` buttons hit 44 px on mobile.** Desktop density is
  unchanged; touch viewports get a `min-height: 44px` to meet
  WCAG 2.5.5.
- **Skip-to-content link confirmed.** The skip-link / `<main>`
  landmark pair was already in `app/[locale]/layout.tsx`; the
  audit finding was a false read.

### Changed

- **How-it-works animations (framer-motion).** The hero now fades
  its title in with a blur clear, popping the gradient words
  ("SATS", "PESOS" — now uppercase) in *first* with a spring and
  fading the surrounding text in after; subtitle follows. The
  pinned journey sequence (bubble → burst → polaroid) is now driven
  by a spring-smoothed scroll progress so it glides instead of
  tracking the scrollbar 1:1, and the polaroid forms as a
  continuous scrub rather than a hard snap-in. The "who is who"
  glossary reuses the landing's `RevealPolaroids` drop, and the
  closing CTA block fades + rises in via a new shared
  `components/common/reveal` primitive. Hero markup/styles moved
  into a co-located `components/how-it-works/intro-hero`. Respects
  `prefers-reduced-motion`.

- **Landing animations (framer-motion).** The hero title now
  assembles word-by-word with a blur-clear + rise, ending with a
  soft spring overshoot on the gradient word ("SATS"); the
  subtitle and CTAs follow in cascade. The highlighted-courses
  section reveals its title with a blur-clear fade and slides
  offering cards in from the left. The need-motivation and
  travel-companions polaroids drop in from above with alternating
  tilts and a spring landing — same primitives in both, lifted to
  `components/common/reveal-header` and
  `components/common/reveal-polaroids`. The support-cursats block
  fades its header in with a blur clear and rises the CTAs, the
  contribute label, and the per-project repo links in a soft
  cascade. Scroll triggers are tuned per section so the cascade
  only starts once the relevant content is well in view. Respects
  `prefers-reduced-motion`. Also bumps "sats" → "SATS" inside the
  landing hero gradient for both
  locales.

- **`/explore` is personalised for signed-in users.** When a
  logged-in buyer hits `/explore` with no filter / sort / search
  active, a "Suggested for you" rail of four cards now sits above
  the main grid (driven by `listRecommendedOfferings`). The rail
  itself renders only on page 1, but the picked offering ids are
  excluded from the main grid on every page — the buyer never sees
  a recommended course duplicated as they paginate. Filtering or
  sorting flips the page back to the canonical, unpersonalised
  view (a deliberate query overrides personalisation). Anonymous
  viewers and the previous experience are unchanged.
  `listDiscoveryOfferingsPaged` gained an
  `excludeOfferingIds` option (with `notInArray` applied to both
  the row select and the total count so the pager math stays
  right); `SuggestedForYou` learned an optional `result` prop so
  the page can call `listRecommendedOfferings` itself and pass the
  rows down (needed because the rail and the grid share the
  exclusion set). New i18n key `catalog.list.moreToExplore`. ADR
  0024.

- **`/purchases` redesigned.** The page that signed-in buyers land
  on after login is no longer a sparse list — it now adapts to
  whether the buyer has any history. With nothing bought yet, an
  empty-hero block ("You haven't bought any courses yet") sits
  above a "Suggested for you" rail driven by the new
  `listRecommendedOfferings` (falls through to the marketplace
  highlights for a fresh buyer). With history, each order renders
  as a denser row with a 56px cover thumbnail, the course title,
  a seller byline (avatar + name, linking to `/[userSlug]`), the
  date · sats meta, the status pill, and a CTA pair: a primary
  link (Open course / View receipt / Continue checkout —
  whichever fits the order's status) and a secondary "Course
  page" link to the public listing. Pagination is server-side
  (12 per page, reuses `components/catalog/explore-pager`); a
  status filter (All / Paid / Pending / Failed) and a debounced
  title-or-teacher search round out the controls — both
  stateless, encoded into `?status=` and `?q=` so URLs stay
  shareable. New `lib/purchases-params.ts` mirrors the shape of
  `lib/explore-params.ts`. The previous N+1 (one
  `getOfferingById` call per row) is replaced by a single
  `listPurchasesPaged` in `lib/orders.ts` that joins offerings +
  sellers in one shot. New i18n keys under `account.*`
  (`emptyHero.{title,body}`, `filters.*`, `searchPlaceholder`,
  `openCourse`, `viewReceipt`, `viewListing`, `continueCheckout`,
  `noMatches`). The bottom of the populated page renders the same
  `SuggestedForYou` component with `excludeOfferingIds` set to the
  current page's offerings so the rail doesn't re-surface what the
  buyer is already looking at.

- **Specific error messages for failed Lightning Address checks.**
  When a seller's Lightning Address fails the settings-time probe
  or a buyer's mint at checkout, the UI now surfaces the underlying
  reason (invalid format, provider unreachable, no LUD-21 support,
  malformed response) instead of a generic "invalid" / "unavailable"
  toast. The buyer-side messages are candid about the seller's
  wallet being the problem so buyers know to retry vs pick a
  different course. Plumbed via a new `lightning_code` field on
  `OrderCreateError` and a `lightning_reason` field on the
  `/api/checkout` 503 response.

- **Lightning checkout always mints against the seller's real
  Lightning Address.** `getLightningClient()` no longer branches
  on a `LIGHTNING_USE_REAL_CLIENT` env flag — production, staging,
  and `npm run dev` all use `RealLightningClient`, which calls
  the seller's LNURL-pay endpoint and LUD-21 verify URL. The
  `MockLightningClient` stays exported but is only reachable
  through `_setLightningClientForTests`, the explicit test-only
  injection seam used by the LN integration tests. Removes a
  silent-failure footgun where unset env meant fake BOLT11s for
  every direct_lightning order.

- **Course creation now gated on a configured payout method.**
  Submitting the create-course form when the seller has no payout
  destination on file for their current rail (`cbu_alias` → cbu
  or alias; `lightning_address` → LN address) opens a payout-
  setup modal embedding the same `PayoutForm` from `/settings`.
  Saving in the modal writes through to the user row and resumes
  the original submission. `POST /api/my-courses` enforces the
  same check server-side and returns `409 payout_not_configured`
  so a stale page can't slip an unsellable offering through.

### Added

- **Personalised recommendations module.** New
  `lib/recommendations.ts:listRecommendedOfferings({ pubkey, limit,
  excludeOfferingIds })` ranks active offerings by tag overlap with
  the buyer's most recent paid orders (capped at 10) and, as a
  secondary signal, by whether the offering's seller appears in the
  buyer's purchase history. Tag overlap scores 2× per intersecting
  tag; seller match scores 1; ties break by recency. Already-touched
  offerings (any status) and the buyer's own listings are excluded.
  When the personalised slice is short, the result tops up with
  `listHighlightedOfferings`. The returned `fallback` discriminator
  (`tags | sellers | highlights | mixed`) lets the UI pick a
  context-aware subtitle. A new server component
  `components/catalog/suggested-for-you/` consumes the module and
  reuses `OfferingCard`, returning `null` when there are no rows
  so the rail vanishes rather than rendering an awkward empty
  state. A session-gated `GET /api/recommendations` route handler
  (private 60s cache, optional `?limit=` and `?exclude=`) exposes
  the same data for future client-side surfaces. New
  `recommendations.*` i18n namespace in both `messages/es.json` and
  `messages/en.json`. Foundation for the upcoming `/purchases`
  redesign and the personalised `/explore` ordering for logged-in
  users. ADR 0024.

- **Tags on offerings.** Sellers can now label each course with up
  to eight kebab-case tags from the create/edit form (a chip-input
  field below the description; Enter or comma commits a chip,
  backspace on an empty draft removes the most recent one). Tags
  show as pill chips on `OfferingCard` (max three rendered) and
  each chip links to `/explore?q=<tag>` so a buyer can pivot from a
  course to its peers in one click. The `/explore` search bar
  picks up tags transparently — typing `yoga` now matches courses
  tagged `yoga` in addition to the existing title / description /
  seller-name ILIKE branches. Validation in
  `lib/admin/offerings.ts` (`TagSchema`, `TagsSchema`,
  `MAX_TAGS_PER_OFFERING = 8`, `normalizeTags`); schema migration
  `0009_offering_tags.sql` adds the `tags text[]` column and a GIN
  index. Decision in ADR 0024. Foundation for the upcoming
  suggested-for-you rail on `/purchases` and the personalised
  `/explore` ordering for logged-in users.

### Changed

- **Breakpoint hygiene.** Replaced hardcoded `@media` queries in
  `_common-mixins.scss`, the offering detail page, and the
  receipt's nostr-prompt card with `@include mobile` /
  `tabletAndUp` mixins so every breakpoint resolves to the same
  three constants in `_media-mixins.scss`.
- **Design-token hygiene.** Back-link bumped to 44 × 44 px
  (WCAG 2.5.5) with `border-radius: $border-radius-full`;
  checkout-status now uses `$border-radius-md`; confetti in the
  zap modal references `var(--color-nostr)` /
  `var(--accent-gold)` / etc. instead of hex literals so the
  flipping accents pick up the right value per theme; polaroid
  corner uses the new `$border-radius-xs` (4 px). Decorative
  motion amplitudes in `bubble.module.scss` and
  `polaroid.module.scss`, the polaroid's static
  `rgba(0, 0, 0, ...)` shadows (intentionally non-flipping per
  the file's own header comment), and the polaroid's fixed
  320 px width are documented exceptions and stay as-is.
- **Border-radius scale.** Renamed `$border-radius-xs` from 2 px
  to 4 px and introduced `$border-radius-2xs: 2px`, so the
  scale reads 2xs → xs → sm → md → lg → xl → full in
  increasing radius. Three existing 2 px call-sites (the
  attendance polaroid and offering-card focus rings) migrate to
  `$border-radius-2xs` to keep their current look.
- **Features page — deck-deal animation.** The polaroid grid now
  sets up like a hand of cards. On desktop the nine cards stack at
  the top-left where "Dos formas de cobrar" lands, then spring out
  to fill the 3×3 grid in a row-alternating sequence (L→R, R→L,
  L→R). "Sin custodia" — which sits visually on top of the deck
  origin — is pinned to the bottom of the stack and deals last so
  it's unmistakably the closer. Total deal time ~4s with a soft
  spring (stiffness 35). Mobile and tablet get a per-card fade-up
  cascade instead (a single column or 2-col grid can't host a deck
  animation cleanly). `prefers-reduced-motion`, SSR, and first
  client paint all render the static board for hydration safety.
  Knock-on tweaks: hero padding drops to zero on mobile; `<Section />`
  padding tightens to `$spacing-64` on tablet (was only mobile);
  `<HighlightedCourses />` releases its 100vh `min-height` on
  tablet so a 1-2 course rail doesn't leave a trough below it; the
  `[userSlug]` storefront page is wrapped in `<Container>` per the
  chrome pattern.
- **Features page — visual refresh.** New aspirational hero
  subtitle ("Pensado para docentes que enseñan en Argentina…")
  and a styled CURSATS wordmark in the title (CUR in primary,
  SATS in the brand gradient — same treatment as the navbar).
  Each of the nine feature polaroids gets a meaningful frame
  illustration: seven custom SVG scenes (split-bolt rails,
  buyer↔seller direct, mosaic-face anonymity, phone with
  QR-receipt, account dashboard, code-or-download, marketplace
  stalls + "add yours" badge) sized to fill more of the polaroid
  frame, plus the Lightning and Nostr brand logos for the
  instant-payment and Nostr-login cards. Page now wraps in
  `<Container>` per the documented chrome pattern.
- **Shared `<Wordmark />` component.** The CUR/SATS gradient
  wordmark used by the navbar and footer was duplicated in two
  module SCSS files; extracted to `components/common/wordmark/`
  with a single gradient source of truth. Navbar, footer, and
  the features hero all consume the same component.
- **`<Section />` is leaner.** Dropped the internal `.container`
  wrapper div and the `alternate` background prop — both were
  legacy from when Section was a standalone page primitive.
  With the documented "Container is the page wrapper, Section
  goes inside" rule, the inner wrapper duplicated Container's
  max-width and padding. Pages that still use Section standalone
  (`faq`, `how-it-works`) need a follow-up Container wrap.
- **FAQ — refreshed copy and hero.** Title is now "FAQs" with the
  same animated brand gradient used on the landing and how-it-
  works heroes; the helper line ("missing something?") is its own
  paragraph and links the word "GitHub" to the cursats repo.
  Lightning is now described as a second layer on top of Bitcoin
  (not just "the payment network"). Wallet answer no longer
  recommends LaWallet, since the project isn't fully working yet
  — any Lightning wallet is fine. Wapu blurb drops the "sponsor
  of Hackathon #3" framing (the UI has no hackathon context
  anywhere else) and now mirrors the how-it-works glossary
  description. Delivery answer drops the Nostr DM fallback, which
  was removed across the app (in-app receipt URL only).
- **Landing's highlighted-courses rail reads real data.** The
  rail no longer ships hardcoded sample courses. It now queries
  Postgres for up to three offerings ranked by paid-order count,
  topped up with the newest active offerings when fewer than three
  have sales yet. With nothing eligible (fresh install, every
  seller archived), the whole section is hidden — the landing
  flows hero → motivation without a placeholder block. The home
  page switched from `force-static` to `revalidate = 60` so the
  rail picks up new sales/offerings within a minute while the
  page itself stays cached.
- **Mock-data fallbacks removed across buyer surfaces.** The
  explore grid, seller storefront, and offering detail no longer
  fall back to the demo "Satoshi" / "Pampa" catalog when the DB
  is empty or unreachable. Each surface now renders its real
  empty/404 state (existing i18n copy in
  `catalog.list.empty/noMatches` and `storefront.empty`). DB
  errors log to the server console and return empty results
  instead of silently substituting fake content.
- **Public content pages are English-slugged.** `/como-funciona`
  → `/how-it-works` and `/caracteristicas` → `/features`. Clean
  pre-launch rename — no back-compat redirect, since nothing
  links to the old slugs yet. Completes the English/language-
  neutral URL convention for every public route. Decision in ADR
  0023.
- **How it works — refreshed.** A fixed ambient bubble field
  drifts behind the page (the "Bubble Chamber" backdrop;
  transform/opacity-only, fewer on mobile, removed under
  `prefers-reduced-motion`). The two journeys keep the familiar
  structure — a heading then three steps in a row (a column on
  mobile) — but each step is now a real `<Polaroid>` (paper +
  shadow), with a gradient step badge and a view-triggered
  staggered reveal (no scroll-scrubbing, so it appears reliably
  on first scroll). "Quién es quién" keeps the Lightning/Wapu/
  Nostr brand logos and stays static. Copy reflects the live
  flow: creator steps are sign-in → set payout in Settings →
  publish via the create-course form (no store-builder/slug-claim
  step, which never existed), and the removed Nostr-DM delivery
  path is gone from every surface (in-app order history instead).
  Wapu glossary blurb reworded.
- **Features page — corrected copy.** Dropped the "Auto-renovación
  opt-in" card (auto-renewal is deferred from the MVP — ADR 0020)
  and the "Marketplace o self-host" card (the per-merchant
  fork/self-host model was retired — ADRs 0004/0014). Replaced
  with "Pago instantáneo" (Lightning, auto-confirmed) and
  "Marketplace abierto" (any Nostr sign-in gets a storefront, no
  gate). Dropped the DM-delivery claim from the delivery and
  Nostr-login cards. Minor grammar fixes to the no-custody copy
  on both pages.

### Fixed

- **App-wide crash from invalid i18n keys.** The
  `settings.notifications.kind` block keyed its entries by the raw
  notification-kind values `order.paid` / `sale.received`. next-intl
  v4 forbids `.` in message keys (it's the nesting separator), so
  `getMessages()` threw in the root layout and **every page** 500'd.
  The i18n keys are now dot-free (`orderPaid` / `saleReceived`); the
  notification-kind values themselves (DB `notification_prefs`
  keys, the `notificationKindSchema` enum, the Wapu webhook
  payload) are unchanged — only the translation lookup maps to the
  safe token.

### Added

- **Live sats↔ARS exchange rate.** Every price the storefront
  computes (PriceTag, offering detail, explore sort, checkout
  estimate) now uses the real Argentine crypto-market rate from
  Yadio instead of a hardcoded `4 sats = 1 ARS` mock that was
  ~4.5× off. Cached 5 min, with a last-good-rate then static
  fallback so an upstream blip never crashes a price render or
  shows a wildly wrong number. Source overridable via
  `EXCHANGE_RATE_API_URL`. Decision in ADR 0022.

### Fixed

- **Navbar / link navigation showed the landing page.** Clicking
  any navbar link (or an offering card) updated the URL and navbar
  but kept rendering the landing page, and offering-card prefetches
  404'd in the console. The middleware matcher excluded prefetch
  requests, so next-intl's locale rewrite never ran for them and
  `/explore` resolved as `[locale]="explore"` → the landing page.
  Prefetch now flows through the rewrite; the auth gate and session
  refresh still skip prefetch.

### Added

- **Custom 404 page.** A branded "La página que buscabas faltó
  hoy" not-found page: a Polaroid whose photo is a CSS-drawn
  wood-framed green chalkboard on a gray wall, showing an
  attendance roster where the route you asked for is the student
  stamped AUSENTE. Caption carries the headline, a rotating
  "justificativo", and a single chalk-styled "EXPLORAR CURSOS"
  link. Bilingual (es/en), 100% theme-token styled (new
  non-flipping chalkboard tokens), reuses the Polaroid component.

- **Preferences panel on `/settings`.** Default language dropdown
  (es / en) persisted to a new `users.locale` column. Theme stays
  in the navbar (per-device via `next-themes`); the panel renders
  an explanatory note so users don't go hunting for it.
- **Notifications panel on `/settings`.** Per-kind toggles
  (`order.paid`, `sale.received` today) persisted to a new
  `users.notification_prefs` jsonb column. Missing key = enabled.
  The emission code in `lib/notifications.ts:emitNotification` now
  checks the recipient's prefs before inserting a row; existing
  history is never touched.
- **Danger zone on `/settings`.** "Delete account" button with a
  confirmation modal and NIP-98 re-sign. The new
  `DELETE /api/settings` route scrubs PII, sets `deleted_at`,
  marks `active = false`, and clears the session cookie. The row
  stays — foreign keys on offerings / orders / audit log remain
  valid. Decision in ADR 0021.

- **Schema migration `0008_user_preferences.sql`.** Three
  additive columns: `users.locale` (varchar(2), default 'es'),
  `users.notification_prefs` (jsonb, default `{}`),
  `users.deleted_at` (nullable timestamp).

### Added

- **Profile fields on `/settings`.** Display name, bio (up to 500
  chars), and avatar URL join the existing banner URL — sellers can
  edit every field the storefront renders without touching Nostr
  directly. All new fields are seeded server-side from the user's
  Nostr kind:0 profile at sign-in; sellers can override.
- **Lightning Address auto-fill from Nostr.** When the cursats row
  has no Lightning Address but the user's Nostr kind:0 profile
  carries a `lud16`, the settings page pre-fills the field and
  surfaces a hint so the seller knows where the value came from.
  Saving persists it; editing is unrestricted.
- **Pricing currency picker on the offering form.** Sellers now
  choose whether to price the course in ARS or sats. The other
  currency is computed live from the current Wapu exchange rate
  at every render. Replaces the old "ARS price required, sats
  price optional pin" model. Schema migration `0007_pricing_
  currency.sql` drops `price_sats` and renames `price_ars` →
  `price_amount`, plus adds `price_currency` enum. Centralised
  rate access via `lib/exchange-rate.ts`.
- **Auto-generated redemption codes.** Sellers specify a quantity
  on create (default 10, max 10,000); the server mints
  cryptographically random 8-character alphanumeric codes (charset
  excludes 0/O/1/I/L for readability) and stores them in the pool.
  Edit page gains a "Mint more codes" form and a "Download unused
  codes (CSV)" link, both backed by new endpoints at
  `POST /api/my-courses/[id]/mint-codes` and
  `GET /api/my-courses/[id]/codes`.
- **Sliding session — 1h inactivity timeout.** The session JWT
  shrinks from 7-day absolute to 1-hour inactivity. Each
  authenticated request through the edge proxy re-mints the
  cookie with a fresh clock, so a working session never expires
  mid-use. Constant renamed `SESSION_DURATION_DAYS` →
  `SESSION_INACTIVITY_MINUTES`.
- **Tooltip component** ported from arena's
  `components/common/Tooltip`. Used on every label in the settings
  form with non-obvious copy (display name, bio, avatar URL,
  banner URL, Lightning Address, CBU, alias).

### Changed

- **Settings page restructured with a left sidebar.** Five sections
  selected via `?section=` and surfaced as a vertical nav: Profile
  (default), How you get paid, Preferences, Notifications, Danger
  zone. The first two are wired up; the last three show
  coming-soon placeholders so the sidebar doesn't dead-end on a
  blank screen. Each wired panel is its own form with its own Save
  button, so a payout edit doesn't bundle with a profile edit and
  vice versa.

- **ProfileForm gains "Sync from Nostr" and "Publish to Nostr".**
  Sync re-fetches kind:0 from the public relays via a new
  `POST /api/profile/sync-from-nostr` endpoint and pre-fills the
  form with what relays returned; the user reviews and saves to
  persist into the cursats row. Publish builds a kind:0 event
  from the current form state, signs it with the user's signer,
  and broadcasts to `PUBLIC_RELAYS`. Both buttons live next to
  the Save button in the Profile panel.

- **All profile fields fall back to Nostr kind:0** when the
  cursats row is empty (display name → `display_name||name`, bio
  → `about`, avatar URL → `picture`, banner URL → `banner`,
  Lightning Address → `lud16`). A new hint at the top of the
  Profile panel surfaces when any field was pre-filled so the
  user knows the source.

- **`components/admin/settings-form/` moved to
  `components/settings/`.** Per ADR 0014 the admin/ directory is
  being phased out; the new tree splits the single form into
  `profile-form/`, `payout-form/`, `placeholder-panel/`, and
  `settings-nav/`.

- **Settings form restyled** to match the create-course form:
  ceramic-card sections (`@include ceramic-card`), section header
  with title + hint, two-column radio for the payout-method
  picker, full-width grid for the CBU/alias pair.
- **Lightning Address moved into Public profile.** It used to be
  hidden behind the sats-rail radio; now it always shows so a
  seller on the CBU rail can still surface their LN address for
  the Nostr profile sync hint. The Payout section renders a small
  note pointing back to the profile field when the sats rail is
  picked.
- **"Visible to every buyer" warning card removed** from the top
  of `/settings`. CBU/alias data has never been visible to buyers
  (Wapu handles routing in the backend); the warning was
  misleading. The "double-check before saving" copy moved into a
  tooltip on the alias label, where it's contextual.

- **Slug auto-fills from the title.** Typing in the title field
  fills the slug in real-time (lowercased, kebab-cased, ASCII).
  The slug stays editable; once the seller types into it
  manually, the auto-fill stops overwriting their changes. Title
  moved above slug in the form to match the typing order.

- **Cover image is required.** The image upload field on the
  offering form no longer carries the "optional" tag; submission
  is blocked until an image is uploaded or pasted.

- **Removed the back button from `/create-course`.** The page is a
  single focused task; the nav-up affordance was unused chrome.
  Edit page keeps its back link.

- **Offering type is locked after creation.** Switching a course
  from `code` to `download` (or vice versa) on edit would
  strand the code pool or download URL; the type radio is
  disabled in edit mode with a hint explaining why.

- **Refreshed the `/create-course` and `/my-courses/[slug]/edit`
  form.** The single 346-line offering form now groups its inputs
  under four card-style sections (Basics, Pricing, Content &
  delivery, Cover image) with helper text per section. Type-radio
  cards gain a hover and selected state so the active choice is
  obvious. Action buttons stack on mobile with the destructive
  archive button below the primary save. New i18n keys land in
  both `messages/es.json` and `messages/en.json`.

- **Marketing CTAs now point at `/create-course` directly.** The
  landing hero (`components/landing/hero/index.tsx`) and the
  how-it-works page (`app/[locale]/como-funciona/page.tsx`)
  previously linked to `/sign-in?next=/create-course`. The same
  CTA now goes straight to `/create-course`; the edge middleware
  (`proxy.ts`) already redirects anonymous visitors to sign-in,
  so signed-in users skip the bounce.

- **Logged-in pages use Container as the only chrome.** The
  `app/[locale]/(logged-in)/layout.tsx` shared layout previously
  wrapped children in `<Section><Container column>...`. The
  outer `Section` is gone — Container already has its own
  padding and `Section`'s big vertical padding was duplicating
  chrome. Affects `/settings`, `/my-courses`, `/create-course`,
  `/orders`, `/purchases`. Pages that need section banding can
  add their own `<Section>` inside.

- **Moved offering form components out of `components/admin/`.**
  ADRs 0014 and 0016 removed the admin/merchant concept — every
  signed-in user is a creator. The directory name no longer
  fits. `components/admin/offering-form/` →
  `components/courses/offering-form/`;
  `components/admin/image-upload/` →
  `components/ui/image-upload/` (it's a generic uploader, not
  course-specific). With this PR `components/admin/settings-form/`
  is also gone — the settings rewrite split the form into
  `components/settings/{profile-form,payout-form,…}` instead.

### Removed

- **Auto-renewal toggle.** The NWC auto-renewal feature
  (`users.features_autorenewal`, decided in ADR 0005) never
  landed past the settings flag — no NWC client, no cron worker,
  no second checkout button. v1 ships one-shot purchases only.
  The column stays in the DB (no destructive migration); the
  form no longer surfaces the toggle and never sends the field.
  Decision in ADR 0020.

### Fixed

- **Per-type required validation on the offering form.**
  Previously a download-type offering could be saved with an
  empty `download_url`, and a code-type offering with an empty
  `code_pool` — both states silently dead-ended buyers on the
  receipt page. The form now toasts an error and refuses to
  submit when the type-dependent field is missing, and a zod
  `.superRefine` on `CreateOfferingSchema` /
  `UpdateOfferingSchema` enforces the same on the server so a
  bypassed client can't slip through.

### Added

- **`/explore` discovery surface.** The page gains a free-text search
  (title, description, teacher name), a filter by offering type
  (redemption code / download), four sort options (newest, oldest,
  price low → high, price high → low), and offset pagination (12 per
  page with Prev/Next and "Page X of Y"). The controls share the
  ceramic dropdown + search-input styling ported from the Arena
  project's explore surface; filter changes update the URL
  immediately (no Apply button) so result URLs stay shareable. The
  navbar and mobile-menu "Explore courses" entry now links to
  `/explore` directly instead of jumping to the landing-page anchor.

### Changed

- **Restyled the "Cursats" wordmark.** Navbar and footer now render
  the brand as uppercase **CURSATS**, split into a near-black `CUR`
  half and a `SATS` half painted with the same three brand hues used
  by `LogoBlocks` (blue → lime → pink) via `background-clip: text`.
  Weight bumps from bold (700) to extrabold (800) so the wordmark
  pulls more visual weight next to the block stack.

- **Rebranded the product from "Cursá" to "Cursats".** A portmanteau
  of the voseo verb *cursá* and *sats* — the wordmark now names what
  the platform settles in instead of hiding it behind a tagline. The
  verb form survives in body copy (e.g. the landing tagline *"Cursá
  tu próxima clase con sats"*); only the brand noun changes. Scope:
  UI strings (navbar wordmark, footer, manifest, OG image, JSON-LD,
  i18n `siteName`/`siteTitle`/keywords/welcome/settings titles/FAQ
  copy), domain references (`cursa.bitbybit.com.ar` →
  `cursats.bitbybit.com.ar`), GitHub repo references
  (`bitbybit-ar/bitbybit-cursa` → `bitbybit-ar/bitbybit-cursats`),
  `package.json` name, test hostnames (`cursa.test` →
  `cursats.test`), and internal identifiers (Nostr tag namespace
  `cursa_action` / `cursa_signer` / `cursa_locale` → `cursats_*`;
  localStorage keys `cursa-nip46-client-key` and
  `cursa:nostr:profile:` → `cursats-*`; LNURL probe memo
  `cursa-probe` → `cursats-probe`). The Postgres database name
  `bitbybit_cursa` is intentionally preserved. The
  `docs/about/mission.md` "A note on the name" section was rewritten
  to explain the portmanteau etymology. Decision in ADR 0018.

- **Flattened seller URLs and redesigned the course detail page.**
  Seller storefronts move from `/m/[userSlug]` to `/[userSlug]` and
  offering detail pages from `/m/[userSlug]/c/[offeringSlug]` to
  `/[userSlug]/c/[offeringSlug]`. The detail page gains a richer
  layout: hero with the image, title, price, and buy CTA; small
  badges for the payment rail (Lightning) and delivery type (code
  vs download); a long-description block that splits on blank lines;
  and an instructor block (avatar + bio + link to the seller's
  storefront). The seller's `bio` field is now returned by the
  offering query and rendered on the detail page. Internal `/m/`
  references in code comments, i18n copy, and the `OfferingCard`
  href computation are updated. The landing's mock courses
  (`lib/mock/highlighted-courses.ts`) now back the live offering and
  storefront queries as a fallback, so the three seed URLs from the
  landing render real-looking pages before the production catalog is
  populated. Decision in ADR 0017.

- **Collapsed the `merchants` table into `users`.** After ADR 0014
  every signed-in Nostr account already had a `merchants` row, so
  the merchant/user split was vestigial. End-to-end rename: the
  Postgres table moves to `users`; FK columns `merchant_id` →
  `user_id` on `offerings`, `orders`, and `admin_audit_log`; helpers
  in `lib/admin/users.ts` replace `lib/admin/merchants.ts`
  (`getUserByPubkey`, `ensureUserForPubkey`, `updateUserProfile`,
  `claimUser`, `requireUser` / `requirePanelUser`); session JSON's
  `merchant: { ... }` key → `user: { ... }`; URL param
  `/m/[merchantSlug]` → `/m/[userSlug]` (the public path
  `/m/<slug>` is unchanged); error codes `merchant_inactive` /
  `merchant_payout_missing` / `merchant_lightning_address_missing`
  → `seller_*`. The platform-identity file `lib/merchant.ts` is
  renamed to `lib/site.ts` (constant `MERCHANT` → `SITE`) since it
  describes the deployment, not a user row. User-visible Spanish
  copy is unchanged ("profe"); English landing pages replace
  "Merchant panel" with "Creator panel". Migration
  `0005_collapse_merchants_into_users.sql` is a pure structural
  rename, no data backfill. Decision in ADR 0016.

### Added

- **Sats settlement rail.** Merchants can now choose between getting
  paid in pesos (Wapu → CBU/alias, the existing rail) and getting
  paid in sats directly (Lightning Address with LUD-21). The choice
  is per-merchant, set in `/settings`; checkout dispatches on it
  transparently and the buyer UI is unchanged. The order row records
  its rail (`wapu_ars` | `direct_lightning`) at creation, so flipping
  the merchant rail later does not retroactively change the receipt
  of an in-flight order. New `lib/lightning.ts` resolves LN addresses,
  mints invoices via LNURL-pay, and polls the LUD-21 `verify` URL
  for settlement (no NWC required, no webhook). The Wapu webhook
  now refuses non-`wapu_ars` orders with 404 as a safety net. The
  receipt page shows which rail settled the order. Hero copy:
  "El profe cobra **sats o** en pesos, en su CBU." Decision pinned
  in ADR 0015, superseding the rail-count clause of ADR 0002.

### Changed

- **All logged-in routes are now English.** Following the marketplace
  open-up in ADR 0014, the route names settled to language-agnostic
  English: `/configuracion` → `/settings`, `/mis-cursos` →
  `/my-courses`, `/mis-cursos/nueva` → `/create-course`,
  `/mis-cursos/[slug]/editar` → `/my-courses/[slug]/edit`,
  `/mis-ventas` → `/orders`, `/mis-compras` → `/purchases`. Public
  routes also moved: `/explorar` → `/explore`, `/iniciar-sesion` →
  `/sign-in`, `/gracias/[orderId]` → `/receipt/[orderId]`,
  `/reclamar/[orderId]` → `/claim/[orderId]`. `/onboarding` is gone
  — the merchant row is now seeded from kind:0 metadata at sign-in
  (display_name, picture, about) so no separate slug-pick step is
  needed. `/mis-estudiantes` is removed; the buyer-history surface
  it provided overlapped too much with `/orders`. All legacy paths
  (including the pre-ADR-0014 `/panel/*` namespace) 308-redirect to
  the current canonical form via `proxy.ts`. Logged-in pages live
  under a shared `(logged-in)` route group with a common layout so
  each page only renders its own content.

- **Marketplace opened to every signed-in user.** The merchant-only
  `/panel/*` namespace is gone; creator surfaces moved to top-level
  routes (now `/my-courses`, `/settings`, `/orders` per ADR 0015).
  Any Nostr-authenticated session can reach them — the merchant row
  is auto-created at sign-in seeded from the user's Nostr kind:0
  metadata (display_name → slug + display name, picture → avatar,
  about → bio), with a pubkey-derived placeholder fallback when
  kind:0 is unavailable. Decision pinned in ADR 0014 (supersedes
  0008 and 0012).

### Added

- **Unified account menu in the navbar.** The avatar dropdown shows
  My purchases (shopping bag), My courses (book), Settings (gear),
  and Sign out (red), with a notifications bell to the left. The
  avatar pulls the user's Nostr kind:0 metadata via the new
  `useNostrProfile` hook (`lib/hooks/useNostrProfile.ts`),
  fetched once from public relays and cached in localStorage with
  a 24h freshness window. Falls through profile picture → first
  letter of name → `UserIcon`. The standalone Sign out button on
  `/mis-compras` was removed; the heading on that page now reads
  "My purchases" / "Mis compras" to match the menu link.
- **In-app notifications.** New `notifications` Postgres table
  (drizzle migration `0003_notifications.sql`); `lib/notifications.ts`
  exposes `emitNotification` / `listForPubkey` / `markRead` /
  `markAllRead`. The Wapu webhook emits `order.paid` to the buyer
  (when signed in) and `sale.received` to the merchant when an
  order flips to `paid`. The navbar `NotificationBell` polls
  `/api/notifications` every 30 s with a tab-visibility pause and
  optimistic mark-read.
- **Public content pages: How it works, Features, FAQ.** Three new
  standalone routes (`/[locale]/como-funciona`,
  `/[locale]/caracteristicas`, `/[locale]/faq`) replace the
  placeholder FAQ and the previously-anchor-only nav entries. How
  it works covers the buyer flow, merchant flow, a Lightning /
  Wapu / Nostr glossary, and the no-custody pitch. Features is a
  nine-card grid (sats-in/pesos-out, no custody, anonymous
  purchase, optional Nostr login, in-app + DM delivery, opt-in
  autorenewal, merchant panel, codes-or-downloads, marketplace-or-
  self-host). FAQ is ten `<details>` Q&amp;A entries — no JS, fully
  indexable. Navbar and mobile menu rewired so "Cómo funciona"
  and "Features" navigate to the new routes from any page;
  "Explorar cursos" stays as a landing-page anchor. New top-level
  i18n namespaces `howItWorks`, `features`, and `faq` in both
  `messages/es.json` and `messages/en.json` (the placeholder
  `landing.faq` block was removed). Sitemap now enumerates the
  three new routes per locale with hreflang alternates.

### Fixed

- **Notifications i18n keys no longer kill client hydration.** The
  `notifications.types["order.paid"]` and `["sale.received"]` keys
  in `messages/{es,en}.json` contained literal dots, which next-intl
  reserves for namespace nesting and rejects with `INVALID_KEY` on
  every render. Server HTML still went out (status 200) but client
  hydration threw, so React event handlers never attached — the
  mobile burger button was dead and the navbar's scroll-progress
  bar never moved. Re-nested as `types.order.paid` /
  `types.sale.received` so the existing
  `t(\`types.${n.kind}.title\`)` lookup resolves through the
  nesting; DB-stored `kind` values (`"order.paid"`, `"sale.received"`)
  are unchanged.
- **"Sign in" CTA hidden on the sign-in page itself.** The navbar
  desktop button, the mobile icon CTA, and the mobile drawer's full-
  width Sign-in button all now check `usePathname() === "/sign-in"`
  and render nothing on that route, so the page no longer points at
  itself.

- **Navbar sign-in icon CTA no longer leaks onto desktop.**
  `.iconCta` was setting `display: flex` after the `.mobileOnly`
  utility had set `display: none`, so the icon button rendered next
  to the full-text "Sign in" button on desktop. The responsive
  behavior now lives on `.iconCta` directly (`display: none` by
  default, `display: flex` inside the mobile breakpoint), and the
  redundant `mobileOnly` className was removed from the markup.

### Changed

- **"Zap the devs" now opens an in-app Lightning modal** instead
  of handing the visitor off to a `lightning:` URI. New
  `<ZapModal>` (ported from `bitbybit-arena`) presents preset
  amounts (21 / 100 / 500 / 1000 / 5000 sats) plus a custom field
  and an optional 140-char comment, fetches a BOLT11 invoice via
  LNURL-pay against `NEXT_PUBLIC_ZAP_LIGHTNING_ADDRESS` (falls
  back to `NEXT_PUBLIC_LIGHTNING_ADDRESS` for backward
  compatibility), tries WebLN first, and falls back to a QR + copy-
  invoice surface with a polling indicator. New supporting modules:
  `lib/nostr/lnurl.ts`, `lib/hooks/useClipboard.ts`,
  `lib/hooks/useZapPolling.ts`, and a stub `app/api/zap/status`
  route that returns `{ paid: false }` until NWC is wired up
  (matching arena's no-NWC fallback). New i18n keys under
  `landing.support.zapModal` in both locale files plus a
  `common.close` key for the success-state CTA.

### Added

- **Public landing page at `/[locale]`.** The locale root is now
  a proper landing composition: `Hero` (animated gradient on
  "sats", floating bubbles with course-themed icons, "Explore
  courses" + "Publish your course" CTAs), `HighlightedCourses`
  (mocked for v1, see `lib/mock/highlighted-courses.ts`),
  `NeedMotivation` (Arena + Habits polaroid pair),
  `TravelCompanions` (Wapu, La Crypta, LaWallet), and
  `SupportBitByBit`. The marketplace grid moved to
  `/[locale]/explorar`. New `/[locale]/faq` scaffold. Decision
  recorded in ADR 0013.
- **Global Navbar and Footer.** Mounted inside
  `app/[locale]/layout.tsx`, replacing the floating
  `LanguageToggle`. Navbar handles theme + locale toggles,
  login, and (when signed in) an avatar dropdown with "Mis
  compras", "Panel" (merchants/admins), "Cerrar sesión".
  Footer carries Habits / Arena / FAQ / GitHub links.
- **`Block`, `LogoBlocks`, `Bubble` common components.** Ported
  from sister projects (home + arena), recolored to the Cursats
  palette (blue / lime / pink) with new `pink`, `cyan`,
  `orange`, and `gold` Bubble color variants reading from the
  decorative accent tokens.
- **Six course-themed icons:** `MusicNoteIcon`, `MathSymbolIcon`,
  `CoinIcon`, `BookIcon`, `PaletteIcon`, `CodeBracketsIcon`.
  Used by the hero bubbles to hint at course variety.
- **Merchant avatar on `OfferingCard`.** Each card byline now
  shows a 24px round avatar to the left of the merchant name,
  and the avatar+name link to `/m/[slug]`. Card image and
  title link to the offering as before.
- **Idea notes.** `docs/ideas/nostr-reputation.md` captures the
  plan to source the highlighted-courses ranking from Nostr
  reactions; `docs/ideas/professor-profiles.md` captures the
  Arena-style header + courses grid + customizable badges
  vision for `/m/[slug]`.

### Changed

- **Spanish URLs are now unprefixed.** next-intl is configured
  with `localePrefix: "as-needed"` so the default locale (`es`)
  serves at `/`, `/panel`, `/m/[slug]`, etc., while English
  keeps the `/en` prefix. `proxy.ts` regexes, `lib/seo.ts`
  canonical/alternates, `app/sitemap.ts`, and the OG `url` in
  `app/[locale]/layout.tsx` were updated to match. `/es/...`
  redirects to the unprefixed form via the locale middleware.
- **`app/[locale]/page.tsx` is no longer the marketplace
  feed.** The discovery feed moved to
  `app/[locale]/explorar/page.tsx`; the home renders the
  landing composition above. ADR 0013.
- **`OfferingCard` restructured for nested links.** The outer
  wrapper is no longer a `Link`; instead the title, image, and
  CTA each link to the offering, while the avatar+name link to
  the merchant. This keeps Next.js's "no nested links" rule
  honored while letting the avatar navigate independently.
- **Auth components removed:** `components/ui/language-toggle/`
  is gone — the navbar's locale toggle replaces it.
- **Marketplace pivot.** ADR 0012 turns Cursats from a single-
  tenant tool (one fork per merchant) into a multi-tenant
  marketplace where each professor signs in with their Nostr
  key, claims a slug, and sells from their own storefront at
  `/m/[slug]`. The platform never custodies funds — Wapu's
  direct-payment routes ARS straight to each merchant's
  CBU/alias on every invoice. New `merchants` table, every
  offering and order is `merchant_id`-scoped, panel reads/writes
  scope to the signed-in merchant, slug uniqueness is per-
  merchant. ADR 0012 supersedes the single-tenancy half of
  ADRs 0004, 0008, 0009.
- **Wapu integration switched from invoice to direct-payment.**
  `WapuClient.createInvoice` is gone; in its place
  `createDirectPayment` and `issueDirectPaymentFunding` mirror
  the endpoints from `wapu-app/wapu-cli#7`. The `orders` table
  renamed `wapu_invoice_id` to `wapu_tentative_uuid`. Webhook
  events now key on `direct_fiat.*` (`paid`/`expired`/`failed`)
  and the schema validation is flagged TODO(Q1) until Wapu
  publishes the canonical settlement-event shape.
- **Auth model: `requireMerchant` replaces `requireAdmin`.**
  `ADMIN_PUBKEYS` env renamed to `PLATFORM_ADMIN_PUBKEYS` and
  is reserved for the moderation surface (no UI yet); the
  per-merchant panel gate is now "do you have an active
  `merchants` row?", not "is your pubkey in an env list."
  Session JSON includes a slim `merchant` summary +
  `platform_admin: boolean`; the legacy `is_admin` field is
  gone.

### Added

- **Onboarding flow at `/[locale]/onboarding`.** First-time
  merchants land here from the panel layout when they have a
  session but no `merchants` row. The form captures slug,
  display name, optional bio, and an optional CBU/alias.
  Validation lives in `lib/admin/ar-bank-id.ts` (alias 6–20
  `[A-Za-z0-9.-]` per BCRA, CBU 22 digits, reserved-slug list).
- **Per-merchant storefront at `/[locale]/m/[slug]`.** Hero
  with display name + bio + avatar (Blossom-hosted) and the
  merchant's active offerings. Offering detail moves to
  `/[locale]/m/[mslug]/c/[oslug]`; the legacy `/c/[slug]`
  route is removed.
- **Discovery home.** The locale root now lists offerings
  across every active merchant (newest first), with each
  card byline naming the merchant.
- **Audit log carries `merchant_id`** so a future platform-
  admin moderation surface can filter by merchant.

- Settings page at `/[locale]/panel/configuracion`: payout
  details (CBU + alias) plus the `features_autorenewal` toggle
  (ADR 0009). New `lib/admin/settings.ts` with
  `getOrInitSettings` (idempotent — first edit ever inserts the
  singleton row, subsequent edits update it) and
  `updateSettingsForAdmin`. Audit-log diff records the changed-
  key list and never the field values themselves, so a future
  payment-destination secret-leak can't happen from the log.
  `<SettingsForm>` client component handles the PATCH +
  toast feedback. Six new integration tests in
  `tests/integration/lib/admin/settings.test.ts` cover lazy
  init, idempotency, full update, and changed-key-only diff.
- `PATCH /api/admin/settings` route. ADR 0008's NIP-07 re-sign
  on payment-destination changes (CBU/alias) is now enforced:
  the route reads the request body as raw bytes, hashes them
  with sha256, and validates a NIP-98 kind:27235 event whose
  `payload` tag matches that hash. The event's pubkey must
  equal the session pubkey (so an admin can't sign with a
  non-admin key). Errors are mapped to discrete codes
  (`auth_required`, `auth_clock_skew`, `auth_invalid_signature`,
  `auth_mismatch`) so the client can surface user-actionable
  messages. The signed event id lands in
  `payload_diff.signed.event_id` of the audit row.
- Language toggle in the locale layout
  (`components/ui/language-toggle/`). Single ES↔EN button
  positioned top-right, ports the pattern from arena's Navbar.
  Preserves the current path on switch via
  `router.replace(pathname, { locale })`.
- Re-attach signer modal (`components/auth/re-sign-prompt/`) +
  `signWithPrompt` / `requestReSignIn` on `useSignerContext()`.
  Ported from arena's signer-context. Triggered by any post-
  login signing action; nsec/NIP-46 users who reloaded the tab
  re-attach via the modal, extension users see only the native
  prompt. Methods are narrowed by the original signer hierarchy
  (an extension user cannot fall back to nsec on re-attach).
- Offering image upload via Blossom (ADR 0011). New
  `lib/blossom/client.ts` (kind:24242 signed PUT to N servers in
  parallel, any-ok semantics) and `<ImageUpload>` field replacing
  the previous paste-box on the offering form. JPG/PNG/WebP
  ≤5MB, paste-URL fallback survives. Server list is the comma-
  separated `NEXT_PUBLIC_BLOSSOM_SERVERS` env var; default ships
  with `blossom.primal.net` + `cdn.satellite.earth`. The
  `@vercel/blob` dep was dropped from `package.json` and the
  unused `/api/admin/upload` row was removed from
  `docs/architecture/routing.md`.
- Read-only orders list at `/[locale]/panel/pedidos` and
  detail at `/[locale]/panel/pedidos/[orderId]`. The list
  shows the 50 most recent rows with status pills + pubkey
  preview + anonymous flag. The detail surfaces every
  order field including `payment_hash` and the Wapu invoice
  / settlement references for support purposes; cross-links
  to the offering edit page and the buyer detail page.
- Read-only students list at `/[locale]/panel/estudiantes`
  and detail at `/[locale]/panel/estudiantes/[pubkey]`. List
  aggregates `orders` by pubkey via raw SQL (`COUNT`,
  `SUM FILTER`, `MAX`) — anonymous orders excluded; detail
  shows the buyer's full order history with status pills.
  Sanity check on the URL-pubkey shape (64-char hex) before
  hitting the DB.
- `lib/admin/orders.ts` with three reads —
  `listAdminOrders`, `getAdminOrderDetail`, `listAdminStudents`,
  `getAdminStudentDetail` — all returning shapes the panel
  pages consume directly. No mutations: orders/buyers stay
  read-only in v1 per ADR 0008.
- New i18n sub-namespaces under `panel`: `orders`,
  `orders.detail`, `students`, `students.detail`, and
  `settings` (with `form.*`) in both locale files. Plural
  formatting for the "N orders" / "N paid" labels.
- Offerings CRUD on the admin panel. The merchant can list,
  create, edit, and archive their catalog from the browser; this
  is the only mutable surface in v1 per ADR 0008. Three pages:
  `/[locale]/panel/ofertas` (active + archived sections),
  `/[locale]/panel/ofertas/nueva` (create form), and
  `/[locale]/panel/ofertas/[slug]/editar` (edit + archive button
  with confirm prompt). Form is shared (`<OfferingForm>`) and
  POSTs/PATCHes the new admin API.
- Admin API: `POST /api/admin/offerings`,
  `PATCH /api/admin/offerings/[id]`, and
  `DELETE /api/admin/offerings/[id]` (soft delete via
  `archived_at`). All gated by a new `requireAdmin()` helper that
  returns 401 (no session) or 404 (logged-in non-admin) — same
  posture as the panel middleware.
- `lib/admin/offerings.ts` — discriminated-result helpers for
  create / update / archive (`slug_taken`, `not_found`,
  `already_archived` branches), plus list helpers
  (`listAllOfferings`, `listArchivedOfferings`,
  `getOfferingForAdmin`). Zod schemas
  (`CreateOfferingSchema`, `UpdateOfferingSchema`) live in the
  same module.
- `lib/admin/audit.ts:writeAuditLog` — every admin mutation now
  writes an `admin_audit_log` row before returning success
  (actor pubkey, route, action, structured payload diff). Diff
  for updates records the changed-key list rather than full
  values so the log stays compact and avoids leaking secrets.
- Eleven new integration tests in
  `tests/integration/lib/admin/offerings.test.ts` cover create /
  update / archive happy paths, slug-taken on create, slug-
  conflict on update, not_found, archive idempotency, and list
  ordering.
- `<OfferingForm>` client component (shared between create and
  edit) with type radio (code/download), conditional code-pool
  textarea, conditional download-url field, in-line validation,
  toast feedback, and an archive button on edit. New i18n keys
  under `panel.offerings` and `panel.offerings.form` in both
  locale files.
- Admin panel scaffold at `/[locale]/panel` (ADR 0008). Edge
  middleware (`proxy.ts`) gates every `/[locale]/panel/*` path:
  anonymous visitors bounce through sign-in with a `?next=` that
  preserves the original target; signed-in non-admins receive a
  bare 404 (NOT 403 — the surface is intentionally unadvertised).
  The middleware uses `verifySessionToken` (jose-only, no
  `next/headers`) so it runs on the edge runtime; admin status is
  computed at every request from `ADMIN_PUBKEYS` env, which means
  revoking a key from env immediately locks every existing session
  out of the panel without re-issuing JWTs. The page layout
  repeats the session check server-side for defence in depth.
  Sign-in `next` whitelist now includes `/panel`.
- Panel layout (`app/[locale]/panel/layout.tsx`) — sidebar with
  five nav links (Overview, Offerings, Orders, Students, Settings)
  plus a sign-out button reusing the existing `<SignOutButton>`.
  Active link highlighting via a new `<PanelNavLink>` client
  component (`aria-current="page"`).
- Panel overview at `/[locale]/panel` — three stat cards (revenue
  MTD, pending orders, paid in last 30 days) plus a recent-orders
  feed (10 most recent, regardless of status, with status pills
  matching the buyer-side `/mis-compras` palette). All queries
  live in `lib/admin/stats.ts:getAdminOverview` which fans out
  four small selects in parallel via `Promise.all`.
- New i18n namespace `panel` with `nav.*` and `overview.*`
  sub-sections in both `messages/es.json` and `messages/en.json`.
- NIP-46 (Nostr Connect / "bunker") signer method on the sign-in
  page. Buyers with a remote signer (nsec.app, Amber, …) can now
  pair via QR scan (we generate a `nostrconnect://` URI) or by
  pasting a `bunker://` URL their signer produced. New
  `lib/nostr/nip46-login.ts` ports the arena reference: persistent
  client-key in localStorage so re-mounting the panel does not
  rotate identity, abort-signal-aware
  `BunkerSigner.fromURI`, and an `auth_url` callback for signers
  that need an extra approval click. New
  `<NostrConnectPanel>` component renders the QR + paste
  fallback + auth-url banner + slow-hint + expired/retry states.
  `makeNip46Signer` added to `lib/nostr/signers.ts` (it
  delegates `signEvent` to the live BunkerSigner and exposes
  `close()` so the SignerProvider can tear down the relay
  connection on sign-out). `<SignerMethodButtons>` now renders
  all three methods by default (extension, NIP-46, nsec) with
  the picker UI. New `login.connect*` keys in both
  `messages/es.json` and `messages/en.json`. The
  `BunkerLoginError` class carries a stable `bunker_invalid_url`
  code for the localised invalid-paste path. No new tests —
  this is glue around `nostr-tools/nip46`'s already-tested
  primitives plus UI orchestration; relay-handshake testing is
  out of scope for unit/integration suites.
- "Create a new identity" flow on the sign-in page. New
  `lib/nostr/create-account.ts:createNewIdentity` generates a
  fresh secp256k1 keypair via nostr-tools, encodes it to nsec
  bech32, and returns `{ secretKey, pubkey, nsec }`. The sign-in
  page renders a divider + secondary CTA below the signer-method
  picker; clicking it opens a modal that shows the freshly-
  generated nsec, lets the buyer copy it, and requires a
  "saved my key" checkbox before proceeding. Internal state
  machine (`idle` / `auth_failed` / `ready`) matches the arena
  reference: the nsec is pinned on screen BEFORE the auth
  round-trip so a network blip mid-call never strips the user
  of their only copy of the key, and the retry CTA reuses the
  same already-generated signer rather than spawning a fresh
  identity. Four new unit tests in
  `tests/unit/lib/nostr/create-account.test.ts` cover key
  shape, nsec round-trip, schnorr-pubkey derivation, and
  per-call freshness. New i18n keys under `login` in both locale
  files.
- `/api/downloads/[orderId]` proxy route for `type=download`
  offerings. The receipt page's download CTA now points here
  instead of the raw `offering.download_url`, keeping the source
  URL out of the public DOM. The proxy validates that the order
  exists, is `paid`, and that the offering is download-type, not
  archived, and has a URL on file, then 302-redirects to the
  source. Status matrix: 400 (invalid uuid), 403 (not paid), 404
  (missing / wrong type / archived / no URL), 302 (redirect).
  The orderId in the URL stays the access key per ADR 0006 (no
  session required — anonymous buyers must redeem from any
  device). `<ReceiptDownload>` now takes
  `{ orderId, isAvailable }` instead of the raw download URL.
  Seven new integration tests in
  `tests/integration/api/downloads.test.ts` cover the full
  status matrix. Future hardening (per-order expiry, single-use
  semantics) noted inline in the route comment.
- Wapu webhook now draws a redemption code from
  `offerings.code_pool` and assigns it to `orders.redemption_code`
  on the same delivery that flips the order to `paid`. New
  `lib/orders.ts:drawAndAssignCode` helper handles concurrency
  via optimistic-concurrency retry (neon-http does not support
  interactive transactions): the UPDATE on offerings matches the
  candidate's exact pool position, so a racing webhook that
  picked the same code sees zero rows updated and retries with
  the shrunken pool. Idempotent on repeat delivery
  (`already_assigned` short-circuit). Five new integration tests
  in `tests/integration/lib/orders.test.ts` cover assigned,
  idempotent, pool_empty, not_a_code_offering, and a parallel
  race smoke test. Closes the receipt-page "código pendiente"
  gap that was deferred from chunk 4.
- `/[locale]/mis-compras` — order history for the logged-in
  buyer. Server-rendered list of `listOrdersByPubkey(session.
  pubkey)` results, each row linking back to
  `/[locale]/gracias/[orderId]`. Includes a sign-out button
  (new `<SignOutButton>` client component). Empty state links
  back to the catalog. Bounces anonymous visitors to
  `/iniciar-sesion?next=/mis-compras`.
- `/[locale]/reclamar/[orderId]` — claim an anonymous order for
  the current buyer's pubkey. Server-rendered, validates the
  orderId UUID, and bounces anonymous visitors through sign-in.
  Already-yours orders go straight to the receipt; orders held
  by a different pubkey render a dedicated conflict state. The
  claim CTA itself is a small client component that POSTs to
  the new claim endpoint.
- `/api/orders/[orderId]/claim` — POST endpoint that attaches an
  anonymous order to the current session's pubkey. Returns 401
  (no session), 400 (invalid uuid), 404 (no order), 409 (already
  claimed by a different pubkey), or 200 with
  `{ status: "claimed" | "already_yours", order_id }`. The
  session pubkey always wins; we never trust a pubkey from the
  request body.
- `lib/orders.ts:claimOrderForBuyer` helper — discriminated
  result (`claimed` / `already_yours` / `already_claimed` /
  `not_found`). Idempotent on `already_yours` so a buyer who
  clicks twice gets a benign success rather than a confusing
  conflict. Covered by four new integration tests in
  `tests/integration/lib/orders.test.ts`.
- i18n: new `account`, `orderStatus`, and `claim` namespaces in
  both `messages/es.json` and `messages/en.json`.
- Sign-in page at `/[locale]/iniciar-sesion`. Buyers can connect a
  Nostr identity via NIP-07 browser extension (Alby, nos2x) or by
  pasting an nsec; NIP-46 (Nostr Connect) is intentionally
  deferred. Honors a `?next=...` query param so the
  Nostr-prompt-card on `/[locale]/gracias/[orderId]` can bounce
  buyers through sign-in straight to `/reclamar/[orderId]`. Path
  whitelist (`/mis-compras`, `/reclamar/`, `/gracias/`) prevents
  open-redirect on the `next` param.
- `Modal` UI primitive (`components/ui/modal/`) — accessible
  dialog with click-outside / Escape close, focus trap, and
  return-focus on close. Used by the nsec sub-panel on the
  sign-in page.
- Auth UI components ported from arena (kebab-case naming):
  `extension-signer-button` (NIP-07 button with inline
  no-extension help text — replaces the arena Tooltip dep),
  `nsec-signer-form` (paste + show/hide + accept-risk + parse
  via nostr-tools nip19/pure), and `signer-method-buttons`
  (picker that today renders extension + nsec).
- `lib/hooks/useClickOutside.ts` — used by Modal.
- i18n: new `common`, `login`, `reSignIn` namespaces in both
  `messages/es.json` and `messages/en.json`.
- Nostr signer infrastructure ported from `bitbybit-arena`:
  `lib/nostr/signers.ts` (extension + nsec; NIP-46 deferred),
  `lib/nostr/auth-errors.ts` (discriminated `AuthError` for
  cross-namespace localisation), and a slim
  `lib/contexts/signer-context.tsx` that owns session fetch +
  in-memory signer + the NIP-98 login round-trip + sign-out.
  Wired as `<SignerProvider>` inside `app/[locale]/layout.tsx`.
  Auto-restores the extension signer on reload when the session
  cookie matches the extension's pubkey. The arena reference
  splits this into Session/Signer/ReSignIn — Cursats's buyer flow
  only signs at login, so the slimmed combined version covers
  v1; pull in the arena machinery if a future feature signs
  beyond auth.
- Buyer critical-path UI: catalog at `/[locale]`, offering detail
  at `/[locale]/c/[slug]`, Lightning checkout at
  `/[locale]/checkout/[orderId]` (BOLT11 QR + copy + 3-second
  status poll against `/api/orders/[orderId]`), and the permanent
  receipt at `/[locale]/gracias/[orderId]` (redemption code or
  download CTA, plus a Nostr-prompt card for anonymous orders).
  Reuses `Button`, `Card`, `Section`, `Container`, `Toast`, and
  the existing icon set; adds `qrcode.react` for the BOLT11 QR.
  Anonymous-only checkout in this chunk; the optional
  npub-paste-at-checkout (ADR 0007 tier 2), sign-in,
  `/mis-compras`, and `/reclamar` are deferred to a later chunk.
  i18n: new `catalog`, `offering`, `checkout`, `receipt`,
  `pricing`, `errors` namespaces in both `messages/es.json` and
  `messages/en.json`. Routing doc renamed `[invoiceId]` to
  `[orderId]` (the polling API and the receipt URL already used
  the order id; using one name across all three surfaces).
- `lib/offerings.ts` data-layer reads — `listActiveOfferings`,
  `getOfferingBySlug`, `getOfferingById`. Used by the catalog,
  offering detail, checkout, and receipt pages to pull rows from
  Postgres. Mirrors the shape of `lib/orders.ts` and reuses
  `getDb()` from `lib/db/index.ts`.
- `orders.bolt11` column (drizzle migration 0001) so the
  checkout page can re-render the QR after a reload without
  re-calling Wapu. Populated by `createOrder` at invoice time;
  the public `WapuInvoiceState` shape does not surface BOLT11,
  so persisting it on the row is the only way to recover it.
- `scripts/seed-offerings.ts` — seeds three sample offerings
  (two `code`, one `download`) via `npm run db:seed`.
  Idempotent (`ON CONFLICT (slug) DO NOTHING`) and shares the
  dotenv precedence pattern with `scripts/migrate.ts`.
- ADR
  [0010-no-yaml-config](docs/architecture/decisions/0010-no-yaml-config.md):
  no YAML configuration file ships in the repo. Branding lives in
  `styles/_theme.scss`, copy in `messages/{es,en}.json`, merchant
  identity in `lib/merchant.ts`, secrets and `ADMIN_PUBKEYS` in
  env vars, offerings + CBU/alias + autorenewal in Postgres.
  Includes a migration map for every field that used to live in
  the planned `merchant.yaml`.
- ADR
  [0009-offerings-and-settings-in-database](docs/architecture/decisions/0009-offerings-and-settings-in-database.md):
  offerings move to a Postgres `offerings` table (drizzle), and
  runtime settings (CBU, alias, autorenewal toggle) become a
  singleton `settings` row. Vercel Blob for offering images. Soft
  delete via `archived_at`; no drafts, no scheduling, no
  inventory. Supersedes the catalog half of ADR 0004; the
  single-tenant deployment posture stands.
- ADR
  [0008-merchant-admin-dashboard](docs/architecture/decisions/0008-merchant-admin-dashboard.md):
  the merchant admin panel at `/[locale]/panel/...`. Auth via the
  Nostr session module (ADR 0007) gated by `ADMIN_PUBKEYS` env
  var; non-admins receive 404. Read-only over orders, payments,
  and buyers in v1 (filter, search, sort, paginate, CSV export
  remain). Full CRUD over offerings. Settings updates touching
  payment-destination fields (CBU, alias) require a NIP-07
  re-sign at save time. Every mutation writes to
  `admin_audit_log`. Routes inventory listed in the ADR and in
  `docs/architecture/routing.md`.
- `docs/architecture/routing.md`: the full route map (buyer
  flow, account, subscriber, static, panel, API, special files,
  conventions, and what is intentionally not routed). Replaces
  the inline routing snippet in `docs/architecture/overview.md`,
  which now points here.
- ADR
  [0007-optional-nostr-buyer-login](docs/architecture/decisions/0007-optional-nostr-buyer-login.md):
  optional Nostr login for buyers, never required. Three identity
  tiers — anonymous (opaque URL only), anonymous with npub or
  NIP-05 (URL plus DM, no session), and logged-in via Nostr (URL
  plus DM plus persistent `/[locale]/mis-compras` history). Auth
  module ported from bitbybit-arena (NIP-07, raw nsec, NIP-46
  Nostr Connect; `jose` JWT in an httpOnly cookie). Orders move
  from "opaque URL is the only key" to a Postgres row via
  `drizzle-orm`, with `pubkey` nullable so anonymous orders keep
  working unchanged. Settlement stays Wapu-only (ADR 0002).
- ADR
  [0006-nostr-and-inapp-delivery](docs/architecture/decisions/0006-nostr-and-inapp-delivery.md):
  the canonical delivery channel is an in-app receipt page at
  `/[locale]/gracias/[orderId]`; optional NIP-44 Nostr DMs push the
  same content for buyers who connected a pubkey at checkout
  (auto-renewal subscribers always receive DMs since NWC gives us
  their pubkey). No email integration.
- "A note on the name" section in `docs/about/mission.md`
  explaining the voseo origin of the project name and the cursa-vs-Cursá
  surface convention.

### Fixed

- Non-admin requests to `/[locale]/panel/*` now `notFound()`
  instead of redirecting to `/`, matching ADR 0008's "404 not
  403" rule. The middleware was already correct; the layout
  is the belt-and-braces second check.
- `:focus-visible` rings on the modal close/back buttons,
  panel sidebar links, and the offering/settings form inputs.
  Keyboard users now see a clear focus ring everywhere a Tab
  can land.
- Animations on Toast, Button, and Modal are now wrapped in
  `@media (prefers-reduced-motion: reduce)` so users with that
  preference see no slide / lift / fade.
- Autorenewal toggle in the settings form uses an explicit
  `htmlFor`/`id` label association instead of the implicit
  wrapping `<label>`, so screen readers announce it
  consistently.

### Changed

- Brand palette swapped from slate-gray + gold to blue
  (`#3B82F6` primary) + lime (`#A5CE3A` secondary), with four
  decorative accent tokens (pink, orange, cyan, gold). The old
  brand gold survives as `accent-gold` for decorative use.
  `styles/_theme.scss` flattened: every value lives in `:root`
  and `[data-theme="dark"]` only declares the diffs. Brand and
  gray scales (`primary-N`, `secondary-N`, `gray-N`) trimmed to
  five steps each (100/300/500/700/900) and reversed in dark
  mode so role tokens like `--color-primary-hover` and
  `--focus-ring` auto-flip via a single `var()` reference.
  `Button.variant-{accent,secondary}` switched from `$gray-900`
  to `$static-navy` for label text — the gray scale flips in
  dark mode, which would have regressed contrast on the lime
  CTA otherwise.
- ADR
  [0005-prepaid-default-autorenewal-optin](docs/architecture/decisions/0005-prepaid-default-autorenewal-optin.md)
  amended: the autorenewal flag moves from a build-time
  `merchant.yaml` field to a runtime panel toggle stored in
  `settings.features_autorenewal` (Postgres). The NWC client,
  cron handler, and encrypted-secrets storage are now *deployed
  but dormant* when the flag is off, gated by a runtime check —
  rather than the original "stay unwired" posture, which a
  runtime toggle cannot satisfy. Status updated to "Accepted
  (autorenewal flag amended by 0009)".
- `CLAUDE.md` code rules updated to match the new model: the
  "Catalog is config-driven" rule was replaced by "Catalog and
  runtime settings live in Postgres"; the autorenewal rule
  rewritten to reflect the runtime toggle and "deployed but
  dormant" posture; new rules added for "No `merchant.yaml`" and
  "The panel is admin-only"; pointers section gained
  `docs/architecture/routing.md` and the bitbybit-arena auth
  module reference.
- `docs/about/mission.md` reframed the merchant onboarding model
  from "edits a config file" to "developer forks once, merchant
  runs everything from the dashboard." The body paragraph was
  rewritten and the "Vertical depth" / "What we don't do"
  bullets cross-link to ADRs 0008–0010.
- `docs/architecture/overview.md` major rewrite: added Identity
  model and Merchant admin panel sections; Stack now lists
  Postgres + drizzle, Vercel Blob, and `jose`; Routing trimmed
  to a summary with a pointer to the new `routing.md`; the
  former "Merchant config" YAML example replaced by a
  Configuration model table mapping each layer to its editor
  and editing surface; Security expanded with panel auth, admin
  API namespace, audit log, and the per-mutation NIP-07 re-sign
  for payment-destination changes; "What is intentionally not
  here" updated to remove "no buyer accounts" and "no admin UI"
  and to add "no CMS for landing content" plus the read-only
  v1 carve-out.
- ADR 0006 extended to record a third DM trigger — logged-in
  Nostr sessions — alongside npub-at-checkout and NWC-derived
  pubkey for subscribers. Status updated to "Accepted (extended
  by 0007)".
- `docs/about/mission.md` softened "no buyer accounts or login"
  to "no *required* buyer accounts": anonymous purchase remains
  the floor, optional Nostr login is now in scope. The "Vertical
  depth" value was updated for the same distinction. Both edits
  cross-link to ADR 0007.
- Removed every email-delivery reference from `README.md`,
  `CLAUDE.md`, `CONTRIBUTING.md`, `.env.example`,
  `docs/about/mission.md`, `docs/architecture/overview.md`,
  ADR 0003, and ADR 0005. Replaced with in-app receipt + optional
  Nostr DM language consistent with ADR 0006. Dropped the
  `merchant.email` field from the example merchant config.
  `docs/architecture/overview.md` gained a dedicated
  "Notifications & delivery" section.

- Initial app scaffold mirroring `home`'s Next.js 16 structure:
  `package.json` (next, next-intl, next-themes, sass, ESLint,
  TypeScript), `next.config.ts` with the same security headers and
  CSP as `home`, `tsconfig.json`, `eslint.config.mjs`, `vercel.json`,
  `proxy.ts` (next-intl middleware), `i18n/{routing,request}.ts`,
  `messages/{es,en}.json`, `app/[locale]/{layout,page}.tsx`, and a
  placeholder "coming soon" page in es and en.
- `styles/` and `components/ui/` (button, card, container, section,
  toast) copied from `home` for visual and primitive parity. The
  toast pulled in `lib/utils.ts` (`cn` helper) and
  `components/icons/` as required dependencies.
- Theme provider via `lib/contexts/theme-context.tsx` (next-themes
  wrapper; light default, dark toggles `data-theme` on `<html>`).
- Fonts: `Nunito` (display) and `Nunito Sans` (body) loaded via
  `next/font/google` in the root layout and exposed as
  `--font-display` / `--font-body` CSS custom properties.
- SEO surface: per-locale `generateMetadata` (title, description,
  keywords, OG, Twitter, robots, canonical, hreflang alternates),
  `Organization` + `WebSite` JSON-LD with `parentOrganization`
  pointing at BitByBit, dynamic OG image at
  `app/[locale]/opengraph-image.tsx`, `app/sitemap.ts`,
  `app/robots.ts`, `app/manifest.ts`, and a placeholder
  `public/icons/icon.svg` (BitByBit family logo, to be replaced with
  Cursats's own brand mark).
- Initial documentation tree mirroring the canonical structure in
  the `home` repo: `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`,
  `docs/_template.md`, `docs/README.md`, `docs/about/mission.md`,
  `docs/architecture/overview.md`, and the first five ADRs
  (record-architecture-decisions, settlement-via-wapu,
  educator-vertical, static-config-deployment, prepaid-default-
  autorenewal-optin).
