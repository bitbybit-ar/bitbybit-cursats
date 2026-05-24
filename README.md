# Cursats

Lightning checkout for teachers and educational creators. Buyers
always pay in sats; sellers pick how to get paid — pesos to a
CBU/alias via Wapu, or sats straight to their own wallet, connected
by a Lightning Address or by NWC (Nostr Wallet Connect). Built for La
Crypta Hackathon #3 (Commerce), with **Wapu** as the sponsor and one
of the two payout rails.

> Cursá tu próxima clase con sats.

Source for <https://cursats.bitbybit.com.ar>. Part of the
[BitByBit](https://github.com/bitbybit-ar) ecosystem.

## Where this came from

A piano teacher in Buenos Aires wants to extend her studio online
and pick up international students who would happily pay her in
sats — but she still needs pesos in her bank account on Monday
morning to cover rent and groceries. A tango professor in San
Telmo wants to teach the digital nomads passing through the city
this season, charging them in sats straight to his Lightning
wallet, no converter in the middle.

Both are Argentine teachers trying to reach beyond the borders
that card processors and local-only transfers draw around them.
Lightning erases those borders for the buyer; Cursats lets each
seller decide how the sats land on the other side. Built for La
Crypta Hackathon #3 (Commerce) because the Argentine teaching
economy is exactly the audience that benefits most when Bitcoin
payments stop being a trade-off between "global reach" and "I
need pesos this week".

## What it is

An open marketplace where any signed-in Nostr user can sell two
product primitives to learners:

1. **Redeemable codes** — single class, lesson packs, monthly
   bonos. Buyer gets a code on a permanent receipt page and shows
   it in person.
2. **Digital downloads** — PDFs, sheet music, recorded courses.
   Buyer gets a download link on the same receipt page (served
   through a status-gated proxy).

Buyers always pay over Lightning. Sellers pick how the sats land on
the other side with a single picker in Settings. There are two
settlement rails:

- **Wapu (pesos to CBU/alias)** — the inclusive on-ramp. Wapu
  converts the sats to ARS and pushes pesos to the seller's
  Argentine bank. For sellers who want to keep their bank routine
  intact and don't want to learn Bitcoin.
- **Sats straight to your wallet** — direct, non-custodial payouts
  with no converter in the middle, for sellers who already live in
  sats. Connect your wallet one of two ways:
  - **Lightning Address** — LNURL-pay with LUD-21 verify
    (Alby, Blink, Coinos, LNbits).
  - **NWC (Nostr Wallet Connect, NIP-47)** — for wallets that don't
    expose a LUD-21 `verify` URL. Wallets popular in Argentina like
    Primal fail LUD-21, so the Lightning-Address method can't reach
    them; NWC does (Primal, Alby, Coinos, Zeus, LNbits).

Both wallet methods land on the same `direct_lightning` rail — NWC is
a second input method for the sats rail, not a third rail.

## Core flow

```text
1. Browse storefront or /explore        → public catalog, no login required
2. Open offering, click "Pay with sats" → Lightning invoice + QR
3. Pay over Lightning                   → poll Wapu deposit, LUD-21 verify, OR NWC lookup
4. Land on /receipt/[orderId]           → redemption code OR download link
5. Sats settle to seller's chosen rail  → ARS to CBU (Wapu) OR sats to wallet (LN addr / NWC)
```

Step 3 splits by the seller's payout method: a `cbu_alias`
seller's order rides the `wapu_ars` rail and confirms by polling
its Wapu deposit transaction; a sats-rail seller's order
(`lightning_address` or `lightning_nwc`) rides the
`direct_lightning` rail and confirms by polling either the seller's
LNURL-pay `verify` URL (Lightning Address) or the seller's wallet
via NWC `lookup_invoice` — whichever sub-method was stamped on the
order at creation. The buyer experience is identical every way —
same QR, same wait, same receipt page.

## Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript strict
- **i18n**: next-intl — Spanish (default) and English
- **Theming**: next-themes — light / dark
- **Styles**: SCSS modules, tokens in `styles/_theme.scss`
- **Database**: Postgres via `@neondatabase/serverless` + drizzle-orm
- **Image storage**: Blossom (BUD-01/02, content-addressed)
- **Payments rail A**: Wapu API — Lightning invoice + ARS payout to
  CBU/alias
- **Payments rail B** (direct sats): LNURL-pay with LUD-21 verify, or
  NWC (NIP-47, `@getalby/sdk`) — sats straight to the seller's wallet.
  The NWC connection URI is stored AES-256-GCM-encrypted at rest
  (`ENCRYPTION_KEY`) and never returned to the client.
- **Exchange rate**: Wapu
- **Auth**: Nostr only — NIP-07 / nsec / NIP-46, session JWT signed
  with `jose` and held in an httpOnly cookie
- **Hosting**: Vercel

## Quick start and judge walkthrough

```bash
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

Visit `http://localhost:3000`, sign in with Nostr (browser
extension, pasted nsec, or NIP-46 bunker), and you're a seller.
Your slug is assigned at sign-in; in `/settings` pick how you get
paid (Wapu for pesos, or sats to your wallet by Lightning Address
or NWC), then create your first offering in `/create-course`.

If you'd rather skip the create-form clicks, `npm run db:seed`
drops a small set of demo offerings keyed to a pubkey you control
— see [`SUBMISSION.md`](./SUBMISSION.md) for the full setup.

For evaluators, the ordered walkthrough is in
[`docs/testing-plan.md`](./docs/testing-plan.md) — numbered steps
that cover sign-in, creating an offering, both payout rails (Wapu
for ARS, and direct sats by Lightning Address or NWC), the
receipt-page delivery, and the notification bell.

The project is the BitByBit team's entry to **La Crypta Hackathon
#3 — Commerce**, with **Wapu** as the sponsor and one of the two
settlement rails.

## Documentation

Start here if you're evaluating the project:

- [Submission walkthrough](./SUBMISSION.md) — 5-minute
  clone-to-running
- [Testing plan](./docs/testing-plan.md) — ordered numbered
  walkthrough

Feature-level deep dives in [`docs/features/`](./docs/features/):

- [Checkout flow](./docs/features/checkout-flow.md)
- [Settlement rails](./docs/features/settlement-rails.md)
- [Nostr identity](./docs/features/nostr-identity.md)
- [Offerings catalog](./docs/features/offerings-catalog.md)
- [Delivery and receipts](./docs/features/delivery-and-receipts.md)
- [Notifications](./docs/features/notifications.md)
- [Settings and payouts](./docs/features/settings-and-payouts.md)
- [Discovery](./docs/features/discovery.md)

Architecture and history:

- [Mission and product positioning](./docs/about/mission.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Route map](./docs/architecture/routing.md)
- [Automated tests](./docs/architecture/automated-tests.md) — the
  vitest unit + integration suite
- [Architecture decisions (ADRs)](./docs/architecture/decisions/)
- [Documentation standard](./docs/README.md)

Repo-root references:

- [Changelog](./CHANGELOG.md) — product release log
- [Contributing](./CONTRIBUTING.md)
- [Agent instructions and doc standard](./CLAUDE.md)

## Sister projects

- [home](https://github.com/bitbybit-ar/home) — group landing at
  `bitbybit.com.ar`.
- [bitbybit-arena](https://github.com/bitbybit-ar/bitbybit-arena) —
  public Nostr challenges with badges and zaps.
- [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) —
  habit tracker with Lightning rewards.

## License

Open source. See `LICENSE` (TBD).
