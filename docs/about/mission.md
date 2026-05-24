# Mission

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Body, What we don't do | Scoped the no-custody claim to the sats rail; spelled out that the Wapu (pesos) rail receives the buyer's payment into a Cursats-controlled account and settles to the seller's bank in a second leg, so Wapu and Cursats are intermediaries that briefly hold the funds. Repointed the custody bullet's ADR refs to 0015 and 0025. | The old copy said the platform "never custodies funds either way", which is false for the `wapu_ars` rail under the two-leg flow (ADR 0025) — a trust/legal risk surfaced by a docs + copy audit. |
| 2026-05-22 | Body, What we value, What we don't do | Removed the Nostr-DM delivery mentions (the receipt page is now the only channel) and reworded the experimental-feature value bullet away from NWC. | The server Nostr-DM channel and `NWC_CONNECTION_URL` were removed as dead code. |
| 2026-05-21 | Body | Rewrote the opening paragraph to anchor the mission in two concrete Argentine teacher archetypes — the piano teacher reaching international students (Bitcoin in, pesos out) and the tango professor charging digital nomads (Bitcoin in, Bitcoin out). Different phrasing from the README's "Where this came from" so the two read as complementary. | Hackathon documentation pass — the opening previously stated the dual-rail stance abstractly. Pairing it with two concrete characters makes the underserved audience legible at a glance and threads into the README story without duplicating it. |
| 2026-05-12 | —, A note on the name | Rebranded references from "Cursá" to "Cursats" and rewrote "A note on the name" as the portmanteau etymology (*cursá* + *sats*). Updated example URLs to `cursats.bitbybit.com.ar`. | Brand rename per ADR 0018 — the wordmark now surfaces the sats positioning while preserving the voseo verb in body copy. |
| 2026-05-12 | Body, What we value, What we don't do | Reframed the tagline from "buyers pay sats, merchants think in pesos" to the dual-rail story: buyers always pay sats; sellers pick pesos (Wapu) or sats (Lightning Address). Broadened the audience bullet from "Educators only" to "Educational creators — broadly". Replaced "merchant" with "seller" throughout. Updated the example flow to mention both rails. Updated the no-second-rail claim in "What we don't do" to the no-third-rail claim from ADR 0015. | The mission was three pivots behind: ADR 0014 opened the marketplace beyond a narrowly-defined educator set, ADR 0015 added the sats settlement rail, ADR 0016 collapsed `merchants` into `users`. The doc still framed Wapu as the only rail and educators as the only audience. |
| 2026-05-08 | Body, What we value, What we don't do | Pivoted from single-tenant tool to multi-tenant marketplace per ADR 0012. Onboarding is now "sign in with Nostr, claim a slug, paste your CBU/alias", not "developer forks the repo." Wapu direct-payment routes ARS straight to each merchant; the platform never custodies. | The single-tenant model required a developer per merchant — unsustainable for the educator audience. Wapu's direct-payment API removed the only blocker against per-invoice merchant routing. |
| 2026-05-06 | Body, What we value, What we don't do | Reframed the merchant onboarding model from "edits a config file" to "developer forks once, merchant runs everything from the dashboard." Added the panel to the value bullets and noted that catalog/CBU/autorenewal now live in Postgres, edited via `/panel`. Cross-linked ADRs 0008, 0009, 0010. | ADRs 0008–0010 dismantled `merchant.yaml` and moved operational state into Postgres + the panel. The mission still claimed merchants edit a config file, which is now false and would mislead any new contributor reading this first. |
| 2026-05-06 | What we value, What we don't do | Softened "no buyer accounts" to "no *required* buyer accounts" and noted that optional Nostr login is now in scope. Cross-linked to ADR 0007. | ADR 0007 introduces optional Nostr login for buyers (history view + reliable DM push) without breaking the anonymous-purchase floor; the mission must reflect that distinction or it reads as a contradiction. |
| 2026-05-06 | Body, What we don't do, A note on the name | Reframed delivery from email to in-app receipt + optional Nostr DM, consistent with ADR 0006. Added "A note on the name" section explaining the voseo origin. | Email is no longer part of the architecture (ADR 0006), and the meaning of the project name was sitting only in conversation memory, not in the repo. |
| 2026-05-05 | — | Initial version. | Pin the project's reason for existing before any code lands. |

---

BitByBit Cursats exists for the two Argentine teachers most
underserved by today's payment tooling. The piano teacher in
Buenos Aires whose method books and weekly lessons would sell
internationally if accepting cross-border payment were not a
multi-step ordeal — she wants Bitcoin in, pesos in her bank the
same day, no friction. The tango professor whose digital-nomad
students already carry sats but cannot pay him directly without
one of them learning the other's payment universe — he wants
Bitcoin in, Bitcoin out, no converter in the middle.

Educational creators — music schools, tutors, language academies,
yoga studios, code bootcamps, and anyone else publishing
classes, codes, or downloads — have been underserved by existing
payment tooling. Card processors take a cut and demand
paperwork. Direct bank transfers leak through buyer-side friction.
Sats-only solutions assume buyers and sellers are crypto-literate.

Cursats takes the opposite stance: **buyers always pay in sats; the
seller picks how those sats arrive — pesos in their CBU via Wapu,
or sats in their Lightning Address — and the protocol gets out of
the way.**

A creator signs in with her Nostr key — her user row is
materialised on the spot, her display name and avatar pulled
from her Nostr kind:0 if she has one. She picks a slug, picks a
payout rail in Settings (CBU/alias for pesos, Lightning Address
for sats), and is selling within minutes. No fork, no Vercel
project, no env wiring. Her store lives at
`cursats.bitbybit.com.ar/<her-slug>`. The buyer scans a QR; if
she chose Lightning Address, the sats land straight in her wallet
and Cursats never holds them. If she chose Wapu, the payment is
received through Wapu into a Cursats-controlled account and then
settled to her CBU the same business day — on that rail Wapu and
Cursats act as intermediaries that briefly hold the funds before
they reach her bank. A permanent in-app receipt page
delivers the redemption code or download URL.

Sovereignty is preserved as the *self-hosting* path: anyone who
wants their own deployment can fork the repo and run a
single-tenant Cursats against their own Wapu account or Lightning
Address. The hosted marketplace at `cursats.bitbybit.com.ar` is
just the default; the architecture supports either.

We are not building a generic storefront — every other team will.
We are building the smallest possible payments toolkit for the
people who genuinely benefit from sats-in with a real choice of
how those sats come out.

## What we value

- **Vertical depth over horizontal reach.** Educational creators —
  broadly. We say no to physical goods, scheduling marketplaces,
  and *required* login systems. Optional Nostr login is in scope
  (see ADR
  [0007](../architecture/decisions/0007-optional-nostr-buyer-login.md))
  because it adds a history surface without ever blocking a sale.
- **Working in production over working in theory.** Ship what
  works on real Lightning today (one-shot, pre-paid). Treat what is
  still experimental (recurring auto-renewal) as deferred, and say
  so plainly.
- **Seller time over our cleverness.** Every config field that
  doesn't pull weight gets cut.
- **The protocol's evolution as a roadmap.** When Lightning grows
  new primitives, we add them as features behind flags — not as
  abstractions in v1.

## What we don't do

- Custody of sats. The Lightning Address rail routes sats
  straight to the seller's wallet; Cursats never holds them. The
  Wapu (pesos) rail is different by design: the buyer's payment is
  received through Wapu into a Cursats-controlled account and
  settled to the seller's CBU/alias the same business day, so on
  that rail Wapu and Cursats are intermediaries that briefly hold
  the funds before payout. Decisions in ADRs
  [0015](../architecture/decisions/0015-sats-settlement-rail.md)
  and
  [0025](../architecture/decisions/0025-wapu-poll-driven-two-leg-rail.md).
- Generic e-commerce features (stock, variants, shipping,
  tax-by-destination). Decision in ADR
  [0003-educator-vertical](../architecture/decisions/0003-educator-vertical.md).
- A third settlement rail. Wapu (sats → ARS) and Lightning
  Address (direct sats) are the two options; adding a third
  needs a superseding ADR. Decision in ADR
  [0015-sats-settlement-rail](../architecture/decisions/0015-sats-settlement-rail.md),
  superseding the rail-count clause of ADR 0002.
- Email integration, and there is no Nostr DM channel. The
  receipt page is the only delivery channel. Decision in ADR
  [0006-nostr-and-inapp-delivery](../architecture/decisions/0006-nostr-and-inapp-delivery.md).
- *Required* buyer accounts. Anonymous purchase is always
  available — the opaque receipt URL is enough to walk away with
  the redemption code. Optional Nostr login is offered for buyers
  who want a persistent order history at `/[locale]/purchases`.
  Decision in ADR
  [0007-optional-nostr-buyer-login](../architecture/decisions/0007-optional-nostr-buyer-login.md).

## A note on the name

**Cursats** is a portmanteau of *cursá* (the Argentine voseo
imperative of *cursar* — "go take a course") and **sats**, the
unit the platform settles in. The verb still lives in the product
voice — "Cursá tu próxima clase con sats" — but the brand itself
names the thing it does: take a class, settle in sats.

The wordmark is "Cursats" — no accent, single token. The repo,
domain, package, and shell paths use the same form (`cursats`),
so the name reads identically in product copy and in tooling.
