# Hackathon submission — La Crypta #3 (Commerce)

> **Status:** Active
> **Last updated:** 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Feature table | Removed the "NIP-44-encrypted Nostr DMs" row and the DM clause on anonymous checkout; updated the exchange-rate source from Yadio to Wapu's `/exchange_rates`. | The server Nostr-DM channel was removed as dead code, and the rate now comes from Wapu (ADR 0027). |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — the judge-facing front door, orienting evaluators before they enter SUBMISSION.md or testing-plan.md. |

---

## Table of Contents

1. [What this is](#what-this-is)
2. [The hackathon](#the-hackathon)
3. [Two paths through the project](#two-paths-through-the-project)
4. [What's interesting about this build](#whats-interesting-about-this-build)
5. [Documentation map](#documentation-map)
6. [Team and contact](#team-and-contact)

---

## What this is

**BitByBit Cursats** is a Lightning checkout for Argentine
educators and digital creators. Buyers always pay in sats;
sellers pick how to get paid — pesos to a CBU via Wapu, or sats
to a Lightning Address. The platform serves the two Argentine
teachers most underserved by today's payment tooling: the piano
teacher in Buenos Aires who wants international students paying
her in sats but needs pesos in her bank by Monday, and the tango
professor who wants the digital nomads passing through the city
paying him directly in sats with no converter in the middle.

The full origin story is in the
[repo README](../README.md#where-this-came-from); the
product framing in
[`docs/about/mission.md`](./about/mission.md).

## The hackathon

- **Event**: La Crypta Hackathon #3 — **Commerce**
- **Sponsor**: **Wapu** — the Lightning ↔ ARS rail. One of the two
  settlement rails Cursats offers (the other is direct sats via
  LNURL-pay with LUD-21).
- **Team**: BitByBit ([`bitbybit-ar`](https://github.com/bitbybit-ar))
- **Sibling project**: [bitbybit-arena](https://github.com/bitbybit-ar/bitbybit-arena) —
  the team's prior submission for La Crypta Hackathon #2
  (Identity).

The brief asked for a real commerce surface using the sponsor's
rail. Cursats interpreted that as: "the Argentine teaching
economy is exactly the audience that benefits most when Bitcoin
payments stop being a trade-off between *global reach* and *I
need pesos this week*." Wapu's direct-payment API is what makes
the pesos-out path viable without custody.

## Two paths through the project

### 30-second path

1. Open `cursats.bitbybit.com.ar`.
2. Click **Iniciar sesión**, sign in with Nostr (extension /
   paste nsec / NIP-46 bunker).
3. Open `/settings`, fill in a Lightning Address or a CBU,
   re-sign when prompted.
4. Open `/create-course`, publish a `code` offering for 100 sats.
5. From a second browser, click Comprar on your storefront and
   pay the invoice from any Lightning wallet.
6. Watch the receipt page load with the redemption code.

### Full path

Run locally and exercise every surface end-to-end:

1. Setup — [`SUBMISSION.md`](../SUBMISSION.md) (5-minute clone
   to running).
2. Walkthrough — [`docs/testing-plan.md`](./testing-plan.md)
   (eleven ordered numbered steps).

If you only have time for one document beyond this one, read
**[`docs/testing-plan.md`](./testing-plan.md)**.

## What's interesting about this build

A short feature-grep list for judges who want to know where to
look. Each link goes to a dedicated feature doc with the design
rationale, code pointers, and (where relevant) mermaid sequence
diagrams.

| Surface | What's interesting | Deep dive |
|---|---|---|
| **Dual settlement rails** | One `users.payout_method` picker per seller; every order is dispatched server-side. Wapu and LNURL-pay both reach the same buyer-facing checkout. | [settlement-rails](./features/settlement-rails.md) |
| **LUD-21 enforcement** | A Lightning Address must pass a 1-sat probe at *save* time, not checkout time. Broken providers cannot reach production. | [settings-and-payouts](./features/settings-and-payouts.md#the-lud-21-probe-ln-rail-entry) |
| **Buyer-flow parity** | Buyers never see "Wapu" or "Lightning Address" — same QR, same wait, same receipt. The dispatch happens server-side on the seller's stored payout method. | [checkout-flow](./features/checkout-flow.md#why-the-rails-feel-identical-to-the-buyer) |
| **Lazy user-row materialisation** | No sign-up step. The first signed sign-in materialises a `users` row seeded from your kind:0 profile metadata. | [nostr-identity](./features/nostr-identity.md#lazy-user-row-materialisation) |
| **Re-sign on payment fields** | Editing the CBU, alias, Lightning Address, or payout method requires a fresh Nostr signature at save time — a stolen cookie alone is not enough. | [nostr-identity](./features/nostr-identity.md#re-sign-on-payment-destination-fields) |
| **Anonymous-first checkout** | Buyers do not have to sign in. The opaque receipt URL is the only access key and the only delivery channel. | [delivery-and-receipts](./features/delivery-and-receipts.md) |
| **Blossom for images** | Browser-direct, content-addressed image uploads — no image bytes ever pass through the Cursats server. | [offerings-catalog](./features/offerings-catalog.md#images-via-blossom) |
| **Live exchange-rate display** | Sats and ARS shown side by side on every price-bearing surface, via Wapu's `/exchange_rates` with a 5-minute cache and last-good fallback. | [discovery](./features/discovery.md#exchange-rate-display) |
| **Notification bell** | Polled, persistent until marked read, available to any signed-in user — `order.paid` to buyers, `sale.received` to sellers. | [notifications](./features/notifications.md) |

The architecture overview at
[`docs/architecture/overview.md`](./architecture/overview.md)
sits above all of these and pulls them together. The decisions
that shaped each surface live as ADRs under
[`docs/architecture/decisions/`](./architecture/decisions/).

## Documentation map

```text
README.md                              ← project pitch + origin story
SUBMISSION.md                          ← judge quickstart (clone → run → buy)
docs/HACKATHON.md                      ← you are here (judge front door)
docs/testing-plan.md                   ← ordered walkthrough

docs/about/mission.md                  ← product positioning
docs/architecture/overview.md          ← system shape + invariants
docs/architecture/routing.md           ← full route map
docs/architecture/decisions/           ← ADRs (NNNN-*.md)

docs/features/                         ← per-feature deep dives
├── checkout-flow.md
├── settlement-rails.md
├── nostr-identity.md
├── offerings-catalog.md
├── delivery-and-receipts.md
├── notifications.md
├── settings-and-payouts.md
└── discovery.md
```

For the doc standard (header format, change-log discipline,
ISO-date conventions), see
[`docs/README.md`](./README.md) and the canonical project
guidelines in
[`CLAUDE.md`](../CLAUDE.md).

## Team and contact

- **Team**: BitByBit
- **Repo**: <https://github.com/bitbybit-ar/bitbybit-cursats>
- **Site**: <https://cursats.bitbybit.com.ar>
- **BitByBit ecosystem**: <https://github.com/bitbybit-ar>
- **Sister submission**: [bitbybit-arena](https://github.com/bitbybit-ar/bitbybit-arena)
  (Hackathon #2, Identity)
- **Wapu (sponsor / rail provider)**: <https://wapu.app>,
  CLI + API contract reference at
  <https://github.com/wapu-app/wapu-cli>
- **La Crypta**: <https://lacrypta.ar>
