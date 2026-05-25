# Changelog

All notable **product** changes to BitByBit Cursats live here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

> **Note** — per-document edits live inside each doc's own
> `## Change Log` section (see `docs/_template.md`). This file is for
> product releases only.

## [Unreleased]

## [1.0.0] - 2026-05-24

First public release of Cursats — Lightning checkout for Argentine
educators. Buyers always pay in sats; each seller chooses how the
money lands. Built for La Crypta Hackathon #3 (Commerce), with Wapu as
the sponsor and one of the two payout rails.

### Payments and checkout

- Buyers pay over the Lightning Network — a BOLT11 invoice with a QR,
  a copy button, and a live status poll — and can check out
  anonymously or signed in. There are no buyer wallets to detect, and
  every purchase is one-shot.
- Orders confirm by polling, never by webhook. Prices show a live
  sats↔ARS rate sourced from Wapu, and an unpaid invoice flips the
  order to "failed" once it expires, with a clear expired-order screen
  that points the buyer back to start a new one.

### Getting paid — two settlement rails

- **Pesos via Wapu.** Sats are converted to ARS and pushed to the
  seller's CBU/CVU or alias. The seller bears the Wapu fee (previewed
  live as fee/net on the course form), picks a Standard or Fast
  transfer speed, and the net must clear Wapu's 10,000 ARS withdrawal
  floor. Payout is a poll-driven, two-leg flow settled by a scheduled
  job.
- **Sats straight to your wallet.** Non-custodial payouts via a
  Lightning Address (LUD-21) or an NWC connection (NIP-47), so wallets
  that don't expose a LUD-21 verify URL — Primal, Alby, Coinos, Zeus,
  LNbits — can still receive directly. The NWC connection string is
  encrypted at rest and never leaves the server.
- The price currency follows the rail (ARS on the Wapu rail, sats on
  the Lightning rail), and any change to a payment destination requires
  re-signing with your Nostr key.

### Creating and selling courses

- Any signed-in user is a creator. Sell redemption codes (auto-minted,
  downloadable as CSV, top up anytime) or digital downloads, each with
  a cover image, tags, and an auto-filled slug.
- Manage your catalog from "My courses": per-course sales counts and a
  row actions menu (view, see orders, edit, mint codes, archive,
  delete). Archiving hides a course reversibly; deletion is permanent
  and only offered while a course has no sales. Code courses can carry
  a "redeem / contact" link that tells buyers where to use their code.
- Publishing is gated on having a payout method configured, which you
  can set up inline if you haven't already.

### Discovering courses

- A public catalog at `/explore` with full-text search (title,
  description, teacher, tags), a type filter, sort options, and
  pagination — all encoded in shareable URLs. Signed-in buyers also
  get a personalized "Suggested for you" rail.
- Every seller has a storefront at `/<your-slug>` with a profile
  header — avatar, NIP-05 verified badge, bio, a zap button, and a QR
  for identity and Lightning address. The landing page highlights real
  top-selling courses.

### Signing in with Nostr

- Nostr is the only login: a NIP-07 browser extension, a pasted nsec,
  or a NIP-46 remote signer — with a mobile-first deep link that hands
  the connection straight to a signer app. You can also generate a
  fresh identity in-app.
- Your account is created on first sign-in and seeded from your Nostr
  kind:0 profile (name, picture, bio, banner); you can sync from or
  publish back to Nostr, and your preferred language is honored the
  next time you sign in. Sessions use a sliding one-hour inactivity
  timeout.

### Delivery and receipts

- Delivery is a permanent in-app receipt page — no email, no DMs. It
  shows the redemption code or a download link, plus a "next step"
  card for code courses. Downloads are served through a status-gated,
  https-only proxy and are capped at five fetches within 30 days.
- Buyers can buy a course again from its receipt or detail page, and
  can claim an order made anonymously once they sign in.

### Notifications

- An in-app bell surfaces order-paid (buyer) and sale-received
  (seller) events, plus the Wapu payout lifecycle — withdrawal opened,
  pesos released, and failures. Each kind can be toggled in settings,
  and the bell works inside the mobile menu.

### Account and settings

- A settings hub with tabs for your public profile, how you get paid,
  preferences (default language and notification toggles), and a danger
  zone that deletes your Cursats data behind a Nostr re-sign.
- Your orders and your purchases each have their own filterable,
  paginated views.

### Public site and brand

- Bilingual (Spanish default, English) with light and dark themes. The
  landing, How-it-works, Features, and FAQ pages ship with rich scroll
  and reveal animations that respect reduced-motion, plus a custom 404.
  Every page has its own branded social-share card, and course and
  storefront links preview their own image.

### Security and privacy

- A strict Content-Security-Policy with a per-request nonce (no
  inline-script escape hatch in production), an https-only download
  proxy, a tightened NIP-98 replay window, and JSON-LD injection
  hardening. Wallet credentials (the NWC URI) are encrypted at rest and
  never returned to the client, and "no custody" claims are scoped to
  the sats rail — on the Wapu rail the funds are briefly held in
  transit.

### Platform

- Built on Next.js 16 (App Router) with Postgres (drizzle) and deployed
  on Vercel. Accessibility passes include 44px touch targets, a
  skip-to-content link, visible focus rings, and reduced-motion
  support. Released under the MIT license.

[unreleased]: https://github.com/bitbybit-ar/bitbybit-cursats/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bitbybit-ar/bitbybit-cursats/releases/tag/v1.0.0
