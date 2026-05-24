# Judge walkthrough

> **Status:** Active
> **Last updated:** 2026-05-23

---

This is the hands-on guide for evaluating BitByBit Cursats.
Eleven numbered steps, in order; each one is self-contained,
names a visible button label, and — where relevant — tells you
the underlying flow it exercises so you can cross-reference the
feature docs and the code.

> **Setup is in [`SUBMISSION.md`](../SUBMISSION.md).** Install,
> env vars, the optional seeder, and the project's evaluation
> framing live there. This document picks up after the app is
> running on `http://localhost:3000` and you're ready to sign in.
> Locale, signer, and rail-config notes are duplicated only when
> a specific step depends on them.

> **Looking for the automated suite?** This walkthrough covers
> manual UI evaluation only. The vitest unit and integration tests
> — structure, how to run them, the Neon test branch, and the gated
> Wapu staging smoke tests — are documented in
> [Automated tests](./architecture/automated-tests.md).

---

## Step 1 — Sign in

1. Go to `/sign-in` (or click **Sign in** from the navbar
   on `/`).
2. Pick a sign-in method: **Browser Extension**, **Secret key**
   (paste nsec), or **Bunker URL** (NIP-46).
3. Sign the auth event. The server validates the signature, the
   `created_at` freshness, and the pubkey, then materialises (or
   finds) the corresponding `users` row and mints a session JWT
   in an httpOnly cookie.
4. You land on `/my-courses` (the seller's home surface).

On first login the app reads your kind:0 metadata from a default
set of public relays and seeds your display name, avatar, and
bio into the user row — see
[nostr-identity](./features/nostr-identity.md#kind0-seeding-and-the-buyer-avatar-cache).

If you signed in with a paste-nsec, keep the tab open — the key
is held in memory only for the lifetime of the tab.

## Step 2 — Edit your profile

1. Open `/settings`.
2. Confirm your display name and avatar match your Nostr
   profile (if your kind:0 had them). Otherwise fill them in.
3. Note your storefront slug, shown on this page. It is
   generated automatically at sign-in from your Nostr display
   name (or a `user-<first-8>` fallback) and your storefront
   lives at `cursats.bitbybit.com.ar/<slug>` (or
   `localhost:3000/<slug>` locally) — it is assigned for you,
   not chosen here.
4. Save. Display name, bio, and avatar are **Tier 1** fields —
   the session cookie alone is enough; no re-sign prompt should
   appear.

This exercises the identity section described in
[settings-and-payouts](./features/settings-and-payouts.md#two-tiers-of-fields).

## Step 3 — Pick your first payout rail

There are two rails — Wapu (sats → ARS to CBU) or Lightning
Address (direct sats). You can do this step twice if you want to
test both; pick one to start.

### 3a. Wapu rail

1. Still on `/settings`, scroll to **Payout method** and pick
   **Get paid in pesos (CBU/alias)**.
2. Fill in either a 22-digit CBU or an alias.
3. Save. The page prompts you to **re-sign**: confirm via your
   signer (extension popup / bunker push / paste-nsec
   re-entry). This is the **Tier 2** re-sign — the cookie is
   not enough on its own.
4. On success, the row writes and an `admin_audit_log` entry
   records the change with the secret value redacted.

### 3b. Lightning Address rail

1. Pick **Get paid in sats (Lightning Address)**.
2. Paste a Lightning Address you control (e.g.,
   `you@getalby.com`).
3. Save. The server probes the address with a **1-sat LUD-21
   verify call** before accepting it. Providers without LUD-21
   are rejected here, at save time, with a clear error.
4. Re-sign when prompted (same Tier 2 path as 3a).

To switch rails later, repeat 3a or 3b — the previous rail's
destination fields are preserved on switch, so flipping back is
a one-click operation. See
[settlement-rails — single dispatch point](./features/settlement-rails.md#the-single-dispatch-point).

## Step 4 — Create your first offering

1. Click **New course** on `/my-courses` (or visit
   `/create-course`).
2. Pick a primitive: **Redemption code** (`code`) or **Download**
   (`download`).
3. Fill in title, description, an image, a price, and a few
   tags.
   - For `code`: configure the redemption instructions block
     (what the buyer should do with the code).
   - For `download`: upload the file. Images go through Blossom
     (browser-direct, content-addressed); the private download
     file is served later through `/api/downloads/[orderId]`.
4. The price currency follows your payout rail automatically —
   ARS for the Wapu rail, sats for the Lightning Address rail
   (you don't pick it per course). The other currency renders
   live via the Wapu exchange rate. **On the Wapu rail, price
   above ARS 10,000:** that is Wapu's minimum withdrawal, so the
   form rejects a course whose net payout (price − Wapu fee)
   would fall under it (`price_below_wapu_minimum`).
5. Save. The offering goes live immediately — there is no
   separate publish step.
6. For a `code` offering, click **Mint more codes** in the editor
   to add a batch of redemption codes. The pool must be non-empty or
   checkout is refused as sold out (`download` offerings need no
   minting).

The offering is now live at `/<your-slug>/c/<offering-slug>` and
listed on `/explore`. Buyers still can't check out until §3's
destination fields for your payout rail are filled in — that's a
checkout-time guard, not a publish gate.

## Step 5 — Buy from your own storefront (Wapu rail)

Pre-req: §3a completed (or §3b — both work, but the buyer
experience is intentionally identical, so this step uses Wapu;
§6 uses Lightning). Your test course must be priced above Wapu's
ARS 10,000 withdrawal minimum (see Step 4).

Open a second browser profile (or an incognito window) so the
buyer session is separate from the seller session.

1. As the buyer, navigate to `/<your-slug>` and click into the
   offering.
2. Click **Pay with sats**.
3. On the checkout page (`/checkout/[orderId]`), the QR shows a
   Wapu-minted BOLT11 invoice. Note the sats amount and the
   conversion line ("≈ <ARS> ARS").
4. Pay the invoice with any Lightning wallet you have around —
   Wapu staging accepts fake money, so keep the amount small
   (e.g., ~100 sats).
5. Watch the page advance: the checkout page polls
   `/api/orders/[orderId]`, which polls the Wapu deposit
   transaction until it reads `Completed`; the order then flips
   to `paid` and you're redirected to `/receipt/[orderId]`. There
   are no webhooks, so no tunnel is needed.

## Step 6 — Buy from your own storefront (Lightning Address rail)

Pre-req: §3b completed. If you only did §3a, switch now: go to
`/settings`, pick **Lightning Address**, save (re-sign). Nothing
else is needed — the offering still works on the new rail.
In-flight Wapu orders keep their original rail; future orders
take the new one. See
[settlement-rails — single dispatch point](./features/settlement-rails.md#the-single-dispatch-point).

1. As the buyer (same separate session as §5), reload the
   offering page and click **Pay with sats**.
2. The QR now shows a BOLT11 invoice minted by your LNURL
   provider, not Wapu. The buyer experience is otherwise
   identical: same QR layout, same conversion line, same
   "Waiting for your payment…" spinner.
3. Pay the invoice. The sats land directly in your LN wallet —
   no converter, no Wapu in the middle.
4. The client polls `/api/orders/[orderId]`, which server-side
   probes your provider's LUD-21 verify URL until settled.
5. On settle, the page redirects to `/receipt/[orderId]`.

This rail never touches Wapu. Verify by tailing your dev-server
logs while paying the LN-rail invoice: no flip happens until the
LUD-21 verify poll succeeds.

## Step 7 — Receipt page

1. On `/receipt/[orderId]`, confirm the page renders:
   - For a `code` offering: the redemption code, the seller's
     instructions, and a Copy button.
   - For a `download` offering: a **Download file** button
     pointing at the download proxy `/api/downloads/[orderId]`.
2. Bookmark or copy the URL. This is the **only** delivery
   channel — it works forever, regardless of the buyer's
   identity.
3. (Optional) For a `download` offering, click **Download file**
   and confirm the file streams through `/api/downloads/[orderId]`.
   The proxy gates on the order's `paid` status — it 403s an
   unpaid order. See
   [delivery-and-receipts](./features/delivery-and-receipts.md#the-download-proxy).

## Step 8 — Notifications

Switch back to the seller session.

1. The navbar bell now shows an unread count. Open it.
2. The most recent row is a `sale.received` for the order you
   just paid. The body names the offering.
3. Click the row. The bell flips it `read` server-side
   (`PATCH /api/notifications`). A `sale.received` row marks
   read in place (no navigation); a buyer's `order.paid` row
   links to its `/receipt/[orderId]`.
4. From a second pretend account, generate another sale, then
   come back and click **Mark all as read**. Confirm the
   unread count clears via a single
   `POST /api/notifications` call.

If you signed in as a buyer earlier *and* connected the same
pubkey at checkout, an `order.paid` row also lands in the
buyer's bell. Anonymous-purchase orders generate no `order.paid`
(the buyer never opens the bell because they never log in).

## Step 9 — Claim a past anonymous order

This step exercises `/claim/[orderId]` — the path that lets an
anonymous buyer retroactively attach their pubkey to a past
order so it shows up in their `/purchases` history.

1. As a brand-new buyer (third browser profile, no prior
   purchases), buy an offering without connecting any
   identifier.
2. Capture the resulting `/receipt/[orderId]` URL.
3. Now sign in (as that same browser profile) with any Nostr
   identity.
4. Visit `/claim/[orderId]` — either by editing the URL
   directly or via the claim-flow form.
5. Confirm. The server attaches your session pubkey to the
   order and the order appears under `/purchases`.

A second claim against an already-claimed order is a no-op for
the same pubkey and a 409 Conflict for a different one.

## Step 10 — Locale and theme

Quick i18n + theme pass.

1. Switch the navbar language toggle to **EN**. Every visible
   string should swap.
2. Visit the same routes you just exercised — `/explore`,
   `/<slug>`, `/<slug>/c/<offering>`, `/checkout/[orderId]` (a
   pre-existing pending invoice from earlier),
   `/receipt/[orderId]`, `/settings`, `/my-courses`,
   `/orders`. Confirm copy in every locale.
3. Switch the theme toggle to **Dark**. Confirm the storefront
   and all logged-in surfaces respect the choice; the
   preference persists via `next-themes`.
4. Confirm number / date formatting on offering cards. Spanish
   uses comma for decimals and dot for thousands; English the
   opposite.

## Step 11 — Discovery

1. Visit `/explore`. Confirm the grid renders every active
   offering across every seller you've created (you and any
   seeded test sellers).
2. Use the **search** box, the **type** filter (code /
   download), and the **sort** control. The grid updates and the
   active filters are reflected in the URL query (`?q=`,
   `?type=`, `?sort=`).
3. Open a storefront via a card. Confirm the seller's offerings
   and profile render at `/<userSlug>`.
4. If you are signed in, the order of offerings on `/explore`
   reflects a personalised scoring. Sign out and reload to see
   the anonymous (recency-weighted) order.

## What you've covered

By the end of these eleven steps you'll have exercised: all
three Nostr sign-in methods, kind:0 seeding, both payout rails
(Wapu deposit polling and Lightning Address LUD-21 verify
polling), the re-sign discipline on payment-destination fields,
the LUD-21 1-sat probe, both product primitives (`code` and
`download`) including the status-gated download proxy, the receipt
page as the only delivery channel, the claim flow for anonymous
purchases, the notification bell with mark-read and
mark-all-read, the explore search/type/sort controls, the storefront
flat-URL convention (`/<userSlug>` and `/<userSlug>/c/<offeringSlug>`),
the live Wapu exchange-rate display, the locale toggle, and the
dark/light theme.
