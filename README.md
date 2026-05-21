# BitByBit Cursats

Lightning checkout for teachers and educational creators. Buyers
always pay in sats; sellers pick how to get paid. Built for La
Crypta Hackathon #3 (Commerce), with **Wapu** as the sponsor and
one of the two payout rails.

> Cursá tu próxima clase con sats.

Source for <https://cursats.bitbybit.com.ar>.

## What it is

An open marketplace where any signed-in Nostr user can sell two
product primitives to learners:

1. **Redeemable codes** — single class, lesson packs, monthly
   bonos. Buyer gets a code on a permanent receipt page (and an
   optional Nostr DM if they connected a pubkey at checkout) and
   shows it in person.
2. **Digital downloads** — PDFs, sheet music, recorded courses.
   Buyer gets a signed download URL on the same receipt page (and
   the optional Nostr DM).

Buyers always pay over Lightning. Sellers pick one of two payout
rails in Settings (ADR
[0015](./docs/architecture/decisions/0015-sats-settlement-rail.md)):

- **Wapu (pesos to CBU/alias)** — the inclusive on-ramp. Wapu
  converts the sats to ARS and pushes pesos to the seller's
  Argentine bank. For sellers who want to keep their bank routine
  intact and don't want to learn Bitcoin.
- **Lightning Address (sats to your wallet)** — direct payouts
  via LNURL-pay (LUD-21). For sellers who already live in sats and
  want no converter in the middle.

No email integration — see ADR
[0006](./docs/architecture/decisions/0006-nostr-and-inapp-delivery.md).

Every purchase is a one-shot in v1. Auto-renewal was deferred from
MVP — see ADR
[0020](./docs/architecture/decisions/0020-defer-autorenewal-from-mvp.md).

## Stack

Next.js 16 (App Router) · next-intl (es / en) · next-themes ·
SCSS modules · Vercel · Wapu API · Nostr (NIP-04/44 DMs).

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

(Setup details land with the initial scaffold.)

## Documentation

Internal documentation lives in [`docs/`](./docs/README.md):

- [Mission and product positioning](./docs/about/mission.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Architecture decisions (ADRs)](./docs/architecture/decisions/)
- [Changelog](./CHANGELOG.md) (repo root)
- [Contributing + vulnerability disclosure](./CONTRIBUTING.md) (repo root)
- [Agent instructions and doc standard](./CLAUDE.md) (repo root)

The doc structure mirrors the canonical template in
[`bitbybit-ar/home`](https://github.com/bitbybit-ar/home).

## Sister projects

- [home](https://github.com/bitbybit-ar/home) — group landing at
  `bitbybit.com.ar`.
- [bitbybit-arena](https://github.com/bitbybit-ar/bitbybit-arena) —
  public Nostr challenges with badges and zaps.
- [bitbybit-habits](https://github.com/bitbybit-ar/bitbybit-habits) —
  habit tracker with Lightning rewards.

## License

Open source. See `LICENSE` (TBD).
