# Cursats — Judge Quickstart

Five minutes from cloning to exercising the end-to-end Lightning
checkout flow. If you want depth, jump to
[`docs/testing-plan.md`](./docs/testing-plan.md) once the basics
work.

## TL;DR for judges and testers

**The platform is fully working end-to-end from the UI.** You can
sign in with Nostr, create an offering from `/create-course`,
configure either of the two payout rails, take a sats payment,
and land on the receipt page — all without ever touching a
script. The deployed site is `cursats.bitbybit.com.ar`.

**You can also run it locally** with the steps in §2–§4 and test
both rails with fake money. The Wapu rail points at Wapu's staging
environment by default (`https://staging.wapu.app`) so a judge does
not need real ARS.
The direct-sats rail accepts either a **Lightning Address** whose
provider supports LUD-21 (Alby, Blink, Coinos, or LNbits) or an
**NWC** connection (NIP-47 — Primal, Alby, Coinos, Zeus, LNbits)
that you control, with whatever small-sats balance you have on
hand. NWC exists because many wallets the Argentine audience uses
— Primal and Strike among them — do not expose a LUD-21 `verify`
URL, so the Lightning-Address method can't confirm their payments.

**The seeder is optional, not required.** `npm run db:seed`
inserts a small set of demo offerings under an owner pubkey you set
via `SEED_PUBKEY` (or a built-in demo account if you skip it) —
useful if you'd rather skip the create-form clicks and jump into
the buy flow. If you'd rather create offerings yourself from
`/create-course` to evaluate that surface directly, skip §3.

## What you're evaluating

A Lightning checkout for educational creators
(`cursats.bitbybit.com.ar`) with the interesting product surface:

| Surface | Where it shows up |
|---|---|
| **Dual settlement rails** | One picker in `/settings` routes every future order to Wapu (sats → ARS to CBU) or to the seller's own wallet (direct sats). One dispatch point: `users.payout_method`. |
| **Two ways onto the sats rail** | The direct-sats rail accepts a LUD-21 **Lightning Address** *or* an **NWC** connection (NIP-47). NWC reaches wallets that don't expose a LUD-21 `verify` URL — Primal, Alby, Coinos, Zeus, LNbits. Both land on the one `direct_lightning` rail — NWC is an input method, not a third rail. |
| **Sats-rail entry checks** | A Lightning Address must pass a 1-sat LUD-21 verify probe; an NWC URI must pass a `get_info` + `make_invoice`/`lookup_invoice` probe. Broken connections cannot reach production. |
| **Encrypted wallet credential** | The NWC URI is a spending-capable secret, so it is stored AES-256-GCM-encrypted at rest (`ENCRYPTION_KEY`, `lib/crypto.ts`) and never returned to the client — settings exposes a "connected" flag, not the URI. |
| **Nostr identity** | Anonymous vs signed-in tiers; lazy user-row materialisation; kind:0 seeding of the public profile (read, never written). |
| **Authentication** | NIP-07 / nsec / NIP-46 sign-in — mobile leads with a one-tap `nostrconnect://` deep link to an installed signer; session JWT; re-sign required on payment-destination edits. |
| **Two product primitives** | `code` (redeemable in person, drawn from a pre-minted pool) and `download` (served by a status-gated proxy); shared checkout, differentiated only at the receipt page. |
| **Price currency follows the rail** | ARS-rail sellers price in ARS, sats-rail sellers in sats; the storefront shows both, live-converted via Wapu's `/exchange_rates`. |
| **Blossom image storage** | Browser-direct, content-addressed; no image bytes ever go through Cursats. |
| **Anonymous-first buyer surface** | Buy without signing in; the opaque receipt URL is the only access key and the only delivery channel. |
| **Notification bell** | In-app bell for signed-in users — `order.paid` / `sale.received` / payout events. |

For the full breakdown, see the feature docs
in [`docs/features/`](./docs/features/).

## 1. Prereqs

- **Node 20+** (the project targets the current Next.js 16
  baseline).
- **Postgres** — Neon serverless URL (recommended) or any
  Postgres instance you can reach.
- **A Nostr identity** — a browser extension like Alby / nos2x,
  an `nsec1…` you can paste, or a NIP-46 bunker URL from Amber
  / nsec.app. Any one is enough.
- **For the Wapu rail** — a Wapu staging account
  (`https://staging.wapu.app`) and its API key. Wapu's staging
  uses fake money, so no real funds are at risk.
- **For the direct-sats rail** — one of two things you control:
  a Lightning Address whose provider supports LUD-21 (Alby, Blink,
  Coinos, LNbits), **or** an NWC connection string (NIP-47) from a
  wallet that speaks it (Primal, Alby, Coinos, Zeus, LNbits). You
  will pay yourself a sats invoice during the demo; keep amounts
  small.

## 2. Install and configure

```bash
git clone https://github.com/bitbybit-ar/bitbybit-cursats
cd bitbybit-cursats
npm install
cp .env.example .env.local
```

Edit `.env.local` — the fields that matter for the checkout flow:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://…                    # your Neon/Postgres URL

AUTH_SECRET=<run: openssl rand -base64 32>     # JWT signing key

WAPU_API_KEY=<from be-stage.wapu.app>          # Wapu API key (staging is fine)
WAPU_PAY_APU_HOST=https://be-stage.wapu.app    # Wapu API base URL

CRON_SECRET=<run: openssl rand -base64 32>     # secures the settlement cron

ENCRYPTION_KEY=<run: openssl rand -base64 32>  # AES-256-GCM key for the NWC URI
```

Optional but useful:

- `ENCRYPTION_KEY` is only needed if you test the **NWC** payout
  method (or deploy to production); dev/test fall back to a
  deterministic key, so the Wapu and Lightning-Address flows work
  without it. Never use that fallback for real credentials.
- `NEXT_PUBLIC_BLOSSOM_SERVERS` — has a public default that
  works; override only if you want to host images yourself.

The sats↔ARS rate comes from Wapu's `/exchange_rates` (no separate
env var). The settlement cron runs daily on Vercel Hobby; sellers can
sync their own orders on demand from `/orders`.

The `.env.example` itself documents every var; consult it if
something here is unclear.

## 3. Migrate (and optionally seed)

```bash
npm run db:migrate
```

After migration the app is fully functional. **You can stop
here, run `npm run dev` (§4), and create offerings from the
UI** — that's the primary path and exercises the same code
judges are evaluating. The rest of this section only matters if
you'd prefer to start with pre-seeded data.

### Optional: seed pre-built offerings

`scripts/seed-offerings.ts` drops a small set of demo offerings.
Edit the script if you want to change the offerings — title,
description, type, price, payout rail, tags. Set `SEED_PUBKEY` in
your env (npub or 64-char hex) to your own key to own the seeded
offerings — sign in with the matching key and they appear under
`/my-courses`. Leave it unset and they attach to a built-in
all-zeros demo account that nobody can sign in as.

```bash
npm run db:seed
```

The seeder is idempotent — it skips any offering whose
`(owner, slug)` pair is already present, so you can re-run it
without creating duplicates.

To undo, run `npm run db:unseed`.

## 4. Run

```bash
npm run dev
```

Visit `http://localhost:3000/en` for the English UI (Spanish is the
default at `/`; see the note below), click **Sign in**, and pick your
sign-in method (extension / paste nsec / NIP-46 bunker). If you ran the
seeder, sign in with the key you set as `SEED_PUBKEY` so the demo
offerings show up under `/my-courses`. If you didn't seed, click
**Create course** (or go to `/create-course`) and build an offering
from the UI — that's the primary path the project is built around.

Spanish is the default locale. Switch to English with the toggle
in the navbar or by navigating to `/en/...` directly.

## 5. Exercise the three core flows

The flows below are also covered, in finer step-by-step detail,
by [`docs/testing-plan.md`](./docs/testing-plan.md).

### 5.1 Creator onboarding and first offering

1. Sign in with Nostr. Your user row materialises automatically;
   if you have a kind:0 profile, your display name and avatar
   pre-fill (see
   [nostr-identity](./docs/features/nostr-identity.md) for the
   seeding model).
2. Open `/settings`. Pick how you get paid — Wapu (pesos), or
   sats to your wallet by **Lightning Address** or **NWC** — and
   fill in the destination field for that method. (Your storefront
   slug is assigned automatically at sign-in from your Nostr
   profile — there is nothing to pick.) Saving a
   payment-destination field triggers a re-sign prompt — sign
   with the same signer you used to log in.
3. The sats methods are validated at save time: pasting a
   Lightning Address triggers a 1-sat LUD-21 verify probe
   (providers without a `verify` URL are rejected), while an NWC
   URI is validated with a `get_info` + tiny
   `make_invoice`/`lookup_invoice` probe. For NWC, issue a
   **receive-only** connection (no `pay_invoice`) — Cursats only
   mints and looks up invoices, and the URI is stored encrypted
   and never shown again. (See
   [settings-and-payouts](./docs/features/settings-and-payouts.md)
   for the probe mechanics.)
4. Open `/create-course`. Pick a primitive (`code` or
   `download`), set a title, description, price, tags, and an
   image. **On the Wapu (ARS) rail, price comfortably above
   ARS 10,000:** Wapu's minimum withdrawal is ARS 10,000, so the
   form rejects a course whose net payout (price − Wapu fee)
   would fall under that floor (`price_below_wapu_minimum`). Save
   — the offering goes live immediately (there is no separate
   publish step).
5. For a `code` offering, mint a batch of redemption codes with
   **Mint more codes** in the offering editor. A `code` offering with
   an empty pool is treated as sold out, so checkout is refused
   until the pool is non-empty. (`download` offerings need no
   minting.)

Your storefront is live at `/<your-slug>` and the offering is at
`/<your-slug>/c/<offering-slug>`. Note that buyers cannot check
out until your payout rail's destination fields are filled in
(§5.1, step 2).

### 5.2 Wapu-rail buy (sats → ARS to CBU)

Pre-req: you completed §5.1 with `payout_method = cbu_alias` and
a CBU/alias filled in (this stamps `wapu_ars` on the order's
rail), and your test course is priced above Wapu's ARS 10,000
withdrawal minimum (see §5.1, step 4).

1. From a second browser profile (or an incognito window),
   navigate to your storefront and click into your offering.
2. Click **Pay with sats**. The checkout page renders a QR with
   a Wapu-minted BOLT11 invoice. Optionally attach a Nostr
   identifier (`npub1…`) to tie the order to your identity — it
   then shows under `/purchases` and powers the `order.paid`
   notification. (There is no DM; delivery is the receipt page.)
3. Pay the invoice from any Lightning wallet you have around.
   With Wapu staging the amount is fake — keep it small (e.g.,
   100 sats).
4. Watch the page advance. The checkout page polls
   `/api/orders/[orderId]`, which polls the Wapu deposit
   transaction; once it reads `Completed` the order flips to
   `paid` and you're redirected to `/receipt/[orderId]`.
5. Verify the receipt page renders the redemption code (or
   download URL for a `download` offering).
6. Switch back to the seller account; the new sale appears
   under `/orders`, and the navbar bell shows an unread
   notification.

### 5.3 Direct-sats-rail buy (Lightning Address or NWC)

Pre-req: you completed §5.1 with `payout_method =
lightning_address` (LUD-21 Lightning Address filled in) **or**
`payout_method = lightning_nwc` (NWC connection saved). Either
stamps `direct_lightning` on the order's rail; the buyer flow
below is identical for both — only the sub-method differs.

1. From a second browser profile, open the offering page and
   click **Pay with sats**. The checkout renders a QR with a
   BOLT11 invoice minted directly by the seller's wallet — by the
   LNURL provider (Lightning Address) or by the wallet over NWC
   `make_invoice`.
2. Pay the invoice from any Lightning wallet. The sats land
   directly in the seller's wallet.
3. The client polls `/api/orders/[orderId]`, which confirms
   settlement server-side using the sub-method stamped at order
   creation: the seller's LUD-21 `verify` URL (Lightning Address)
   or NWC `lookup_invoice` against the seller's wallet. The buyer
   sees it as a "Waiting for your payment…" spinner; NWC orders
   poll at a slower cadence (`poll_after_ms`) because each poll
   opens a fresh relay connection.
4. Once settled, the page redirects to `/receipt/[orderId]`,
   identical to the Wapu-rail flow.

This rail never touches Wapu — confirmation is the LUD-21 verify
or NWC `lookup_invoice` poll only, so nothing on the Wapu side can
flip a direct-sats order to paid.

## Where to look in the code

| What | File |
|---|---|
| Order creation | `app/api/checkout/route.ts` → `createOrder` in `lib/orders.ts` |
| Order status poll (Wapu deposit + LUD-21 verify) | `app/api/orders/[orderId]/route.ts` |
| Claim a past order | `app/api/orders/[orderId]/claim/route.ts` |
| Settlement (poll deposit, open + poll withdrawal) | `lib/wapu-settlement.ts`, `app/api/cron/wapu-settlements/route.ts`, `app/api/orders/sync/route.ts` |
| Wapu API client | `lib/wapu.ts` |
| Lightning mint + LUD-21 verify | `lib/lightning.ts` (LNURL helper in `lib/nostr/lnurl.ts`) |
| NWC mint + lookup (NIP-47) | `lib/nwc.ts` (`@getalby/sdk` `NWCClient`, `LightningClient`-shaped wrapper) |
| Wallet-credential encryption | `lib/crypto.ts` (AES-256-GCM, `ENCRYPTION_KEY`) |
| Rail dispatch + state machine | `lib/orders.ts` |
| Code minting / draw | `lib/creator/offerings.ts` (`mintCodesForOffering`), `lib/orders.ts` (`drawAndAssignCode`) |
| Download proxy | `app/api/downloads/[orderId]/route.ts` |
| Nostr sign-in + session JWT | `app/api/auth/nostr/route.ts`, `lib/auth.ts` |
| User-row materialisation | `lib/creator/users.ts` (`ensureUserForPubkey`); gates in `lib/creator/require-user.ts` / `lib/creator/page-context.ts` |
| Re-sign on payment fields | `app/api/settings/route.ts`, `lib/creator/sign-settings-payload.ts` |
| Exchange rate | `lib/exchange-rate.ts` |
| Blossom upload (client-side) | `lib/blossom/client.ts` |
| Personalised discovery | `lib/recommendations.ts`, `app/api/recommendations/route.ts` |
| Notification helpers | `lib/notifications.ts` |
| Notification API | `app/api/notifications/` |
| Site identity / branding | `lib/site.ts` |
| SEO surfaces | `app/[locale]/layout.tsx`, `lib/seo.ts` |

## Troubleshooting

- **"Wapu API key not configured"** — `WAPU_API_KEY` is missing
  from `.env.local`. Get a key from Wapu staging
  (`https://staging.wapu.app`) and set it.
- **"Lightning Address rejected"** — the provider does not
  advertise a LUD-21 `verify` URL. Primal and Strike both fail
  here. Use a LUD-21 provider (Alby, Blink, Coinos, LNbits) or
  switch to the **NWC** method, which reaches Primal, Alby, Coinos,
  Zeus, and LNbits. See
  [settings-and-payouts](./docs/features/settings-and-payouts.md)
  for the probe details.
- **"NWC connection rejected"** — the `nostr+walletconnect://` URI
  could not complete the `get_info` + `make_invoice`/`lookup_invoice`
  probe. Re-issue the connection with **receive** permissions (no
  `pay_invoice` needed), confirm its relay is reachable, and paste
  the full URI. If the save itself errors, set `ENCRYPTION_KEY` (§2)
  — it is required to store the URI.
- **"Cannot create offering"** — `payout_method` is unset, or
  the destination field for the active rail is empty. Go to
  `/settings` and complete the rail.
- **Re-sign prompt never appears** — the signer extension is
  not installed, or you signed in with a paste-nsec session
  that the page lost. Sign in again before saving payment
  fields.
- **Order stuck on "Waiting for your payment…" (Wapu rail)** — the deposit
  hasn't confirmed yet. The checkout page polls
  `/api/orders/[orderId]`, which polls the Wapu deposit
  transaction; on staging this is usually quick. There are no
  webhooks, so no tunnel is needed.
- **Exchange rate shows "—"** — Wapu's `/exchange_rates` is
  unreachable and the cache is cold. The static fallback should
  kick in on the next request; check the server logs for the
  chain.

## Full walkthrough

When you want to exercise the full feature surface — sign-in
methods, kind:0 seeding, both rails, claim flow, notification
bell, locale switching — jump to
[`docs/testing-plan.md`](./docs/testing-plan.md). Numbered
steps, each naming a visible button label and the underlying
flow it exercises.

Prefer to run the programmatic suite? `npm test` runs the vitest
unit and integration tests. Their structure, the Neon test branch
setup, and the gated Wapu staging smoke tests are documented in
[`docs/architecture/automated-tests.md`](./docs/architecture/automated-tests.md).
