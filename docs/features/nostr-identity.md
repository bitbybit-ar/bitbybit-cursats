# Nostr identity

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Kind:0 seeding, Re-sign on payment-destination fields | Documented `refreshUserFromKind0` topping up placeholder/empty fields at every sign-in, added `lud16` → `nostr_lightning_address` seeding, and noted the public Nostr address is exempt from the re-sign list. | ADR 0030 + issue #30 — sign-in now syncs the display name and the public LN address is split from the payout one. |
| 2026-05-22 | Identity tiers, Platform admin moderation, What we do not do | Collapsed the identity tiers from three to two (dropped the anonymous-plus-Nostr-DM tier), removed the platform-admin moderation section, and dropped the server-signed-DM mention. | The server Nostr-DM channel and the `PLATFORM_ADMIN_PUBKEYS` moderation lever were removed as dead code. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — explain the three identity tiers, the sign-in surface, the lazy user-row materialisation, and the re-sign discipline on payment-destination fields. |

---

## Table of Contents

1. [Why Nostr at all](#why-nostr-at-all)
2. [The two identity tiers](#the-two-identity-tiers)
3. [Sign-in surface — three signers, one API](#sign-in-surface--three-signers-one-api)
4. [Lazy user-row materialisation](#lazy-user-row-materialisation)
5. [Kind:0 seeding (and the buyer avatar cache)](#kind0-seeding-and-the-buyer-avatar-cache)
6. [Re-sign on payment-destination fields](#re-sign-on-payment-destination-fields)
7. [Session shape](#session-shape)
8. [What we do not do](#what-we-do-not-do)

---

## Why Nostr at all

The point of Cursats is to take payment from someone you have
never met before — in another country, in another currency, with
no pre-existing account on either side. Card processors solve
this with KYC, accounts, and fees; Cursats solves it with Nostr.

For the buyer, Nostr is **optional**. Anyone can pay an invoice
and walk away with a receipt URL; the platform never demands an
account, never asks for an email, never gates the redemption
behind a login.

For the seller, Nostr is **mandatory and free**. A creator signs
in once with their existing Nostr identity (or generates one
locally with nsec), and is immediately a seller — no application,
no slug claim form, no separate onboarding. The user row is
materialised lazily on first sign-in and seeded from whatever
kind:0 profile metadata the user already has.

Decisions in ADRs
[0007-optional-nostr-buyer-login](../architecture/decisions/0007-optional-nostr-buyer-login.md)
and
[0014-marketplace-open-to-all-logged-in-users](../architecture/decisions/0014-marketplace-open-to-all-logged-in-users.md).

## The two identity tiers

| Tier | Who | What they get | What they sign |
|---|---|---|---|
| **Anonymous** | A buyer who clicks Pay with sats | A redemption code on `/receipt/[orderId]`, accessible only via the opaque URL | Nothing |
| **Signed-in via Nostr** | Any user who signs in on `/sign-in` | The receipt page + persistent order history at `/purchases` + automatic seller surfaces at `/my-courses`, `/create-course`, `/orders`, `/settings` | A NIP-07-style auth event on sign-in (and another on payment-destination field saves) |

The platform never *requires* an upgrade between tiers. A buyer
who paid anonymously can later sign in and claim that order via
`/claim/[orderId]` (the opaque URL is enough proof). A signed-in
seller can pay anonymously for someone else's offering without
losing seller status.

## Sign-in surface — three signers, one API

`/sign-in` offers three signer choices, all of which produce the
same signed auth event on the same `POST /api/auth/nostr`
endpoint:

1. **NIP-07 browser extension** — Alby, nos2x, Flamingo, etc.
   The extension signs the auth event without exposing the
   private key to the page.
2. **Pasted `nsec1…`** — for evaluators or users who do not yet
   have an extension installed. The key is held in memory for
   the lifetime of the tab and is never persisted to disk or
   sent to the server. (Convenient for the (AI) judge path; see
   [`testing-plan.md`](../testing-plan.md).)
3. **NIP-46 bunker** — `bunker://…` URL from Amber, nsec.app,
   or any compatible remote signer. The key stays on the user's
   phone or remote daemon; the browser sends an unsigned event
   and gets a signed event back over a Nostr relay.

The server validates the signature and the event's
`created_at` freshness, materialises (or finds) the user row,
mints a session JWT, and sets it as an httpOnly cookie.

## Lazy user-row materialisation

There is no separate "create your account" step. The first
successful sign-in for a given pubkey calls
`ensureUserForPubkey` (in `lib/creator/users.ts`) which:

1. Looks up `users` by pubkey.
2. If absent, inserts a row with:
   - `slug` = `user-<first 8 hex chars of pubkey>` (auto-generated,
     guaranteed unique)
   - `display_name`, `avatar_url`, `bio` = seeded from kind:0
     metadata if discoverable (see next section)
   - `payout_method` = `cbu_alias` (the schema default; the
     destination fields stay empty until the seller fills them
     in, and checkout is refused until they do)
3. Returns the row to the caller.

`ensureUserForPubkey` is called from three places: the sign-in
route (`app/api/auth/nostr/route.ts`), the API-route gate
`requireUser` (`lib/creator/require-user.ts`), and the page-side
gate `requirePageUser` (`lib/creator/page-context.ts`). The gate
either renders the page (user is active) or 404s (the
`users.active` flag is false).

The same idempotent flow runs every sign-in: a returning user
just looks up their existing row.

## Kind:0 seeding (and the buyer avatar cache)

When a new user row is created, the server tries to fetch the
user's **kind:0 metadata** (their public Nostr profile) from a
default set of public relays. These fields are absorbed:

- `name` or `display_name` → seeded into `users.display_name`,
  and (if the auto-generated slug is still `user-<…>`) used as
  the basis for a friendlier slug.
- `picture` → seeded into `users.avatar_url`.
- `banner` → seeded into `users.banner_url`.
- `about` → seeded into `users.bio`.
- `lud16` → seeded into `users.nostr_lightning_address` (the
  public Nostr Lightning Address; ADR 0030).

This is **seed-on-create, then top up placeholders/empties at every
sign-in.** The full seed happens at row creation. After that,
`refreshUserFromKind0` (`lib/creator/users.ts`) runs on each sign-in
and refreshes only fields the user hasn't set: `display_name` *while
it still equals the `user-<…>` placeholder*, and any still-empty
`avatar_url` / `banner_url` / `bio` / `nostr_lightning_address`. It
never overwrites a value the user has edited, and never changes the
`slug` (that would break their storefront URL). This is what fixes
the placeholder-display-name bug (issue #30): a row first created
during a slow-relay sign-in no longer stays `user-<…>` forever.

Beyond those placeholder/empty fills, the user's Postgres copy is
authoritative — a later edit to kind:0 in their main Nostr client
does not silently overwrite a Cursats field they've already set. A
user who *wants* to pull their latest kind:0 into every field can
trigger it explicitly (the "sync from Nostr" action,
`app/api/profile/sync-from-nostr/route.ts`, backed by
`lib/nostr/profile.ts`). Edits made in `/settings` are stored in
Postgres; Cursats does not silently mirror them back to the user's
kind:0 profile.

Separately, on the **buyer side**, the navbar avatar uses
`useNostrProfile` (`lib/hooks/useNostrProfile.ts`) to fetch the
signed-in user's kind:0 from public relays via `nostr-tools/pool`
and cache it in `localStorage` with a 24-hour freshness window.
The fallback chain is `picture → first-letter chip → UserIcon`,
so even an offline relay never leaves the navbar empty.

## Re-sign on payment-destination fields

Sign-in proves you control the pubkey *right now*. But a session
cookie is just a cookie — if it leaks, an attacker could in
principle quietly redirect a seller's settlement to their own
bank account by editing `/settings`.

The defence is a **per-mutation re-sign** on the fields that
control where money goes:

- `users.cbu` (Argentine bank account)
- `users.alias` (Argentine bank alias)
- `users.lightning_address` (the **payout** LN address)
- `users.nwc_uri` (the NWC payout connection)
- `users.payout_method` (the rail dispatch field)

`users.nostr_lightning_address` is deliberately **not** in this
list — it is the public Nostr `lud16`, not a payout destination, so
editing it on the Profile tab needs no re-sign (ADR 0030).

The PATCH handler (`app/api/settings/route.ts`, with the payload
helper in `lib/creator/sign-settings-payload.ts`) refuses to write
any of these unless the request carries a freshly signed Nostr
event proving the *same* pubkey re-asserted intent at save time.
A stolen cookie alone is not enough — the attacker would also
need to be holding the private key, which means they were
already the user.

Lightning Address changes additionally pass through a 1-sat
LUD-21 probe before they're accepted. See
[settings-and-payouts](./settings-and-payouts.md) for the full
PATCH flow.

## Session shape

- `jose`-signed JWT.
- Stored in an httpOnly, Secure, SameSite=Lax cookie.
- Carries the pubkey, the session expiry, and nothing else
  (never a private key, never the kind:0 metadata, never the
  payout fields).
- Verified on every panel-gated request by the edge middleware
  in `proxy.ts`; anonymous requests bounce to
  `/sign-in?next=<original>`.

The JWT signing key lives in env vars and never reaches the
client. Rotating it invalidates every active session at once;
that is the intended trade-off versus per-user revocation lists.

## What we do not do

- **Email.** No email field at sign-up, no email recovery, no
  email DMs. Decision in ADR
  [0006](../architecture/decisions/0006-nostr-and-inapp-delivery.md).
- **Password.** Never. There is no password field anywhere in the
  app; sign-in is exclusively via Nostr signers.
- **Buyer-side wallet detection.** A buyer comes to a sats
  checkout to pay sats. The app does not snoop for a wallet, does
  not auto-detect WebLN, does not pre-fetch addresses.
- **Forced onboarding.** A signed-in user is a seller immediately.
  Configuring a payout rail gates *checkout on your own
  offerings* (buyers can't pay until it's set), not browsing or
  buying from others.
- **Slug-claim contention.** Slugs are auto-generated; the
  ar-bank-id reserved-slug list blocks reserved tokens (top-level
  route names like `c`, `m`, `explore`, `settings`); the rest is
  first-come-first-served via `/settings`.
- **Writing your kind:0 profile.** Cursats reads kind:0 metadata
  to seed a user row (and re-reads it on an explicit sync), but
  never writes, edits, or annotates your kind:0 profile on its
  own. The only outgoing Nostr events are the client-signed
  "share" events you choose to publish via `lib/nostr/publish.ts`,
  and none of them mutate your profile metadata.
