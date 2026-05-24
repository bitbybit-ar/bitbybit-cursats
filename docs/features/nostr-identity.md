file
# Nostr identity

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | — | Split the login half out into [`authentication.md`](./authentication.md): removed the "Sign-in surface", "Session shape", and "Re-sign on payment-destination fields" sections plus the email/password non-goals, and added cross-links to the new doc. This doc now covers *who you are on Nostr* (profile, tiers, the user row, kind:0); the signer/session mechanics live next door. | The doc was carrying two concerns at once; the login material — including the newly-documented mobile flow — earns its own doc. |
| 2026-05-24 | Kind:0 seeding, Re-sign on payment-destination fields | Documented `refreshUserFromKind0` topping up placeholder/empty fields at every sign-in, added `lud16` → `nostr_lightning_address` seeding, and noted the public Nostr address is exempt from the re-sign list. | ADR 0030 + issue #30 — sign-in now syncs the display name and the public LN address is split from the payout one. |
| 2026-05-22 | Identity tiers, Platform admin moderation, What we do not do | Collapsed the identity tiers from three to two (dropped the anonymous-plus-Nostr-DM tier), removed the platform-admin moderation section, and dropped the server-signed-DM mention. | The server Nostr-DM channel and the `PLATFORM_ADMIN_PUBKEYS` moderation lever were removed as dead code. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — explain the three identity tiers, the sign-in surface, the lazy user-row materialisation, and the re-sign discipline on payment-destination fields. |

---

## Table of Contents

1. [Why Nostr at all](#why-nostr-at-all)
2. [The two identity tiers](#the-two-identity-tiers)
3. [Lazy user-row materialisation](#lazy-user-row-materialisation)
4. [Kind:0 seeding (and the buyer avatar cache)](#kind0-seeding-and-the-buyer-avatar-cache)
5. [What we do not do](#what-we-do-not-do)

---

> **Looking for how sign-in works?** The signer methods (NIP-07,
> `nsec`, NIP-46), the mobile `nostrconnect://` deep link, the
> session JWT, and the payment-destination re-sign discipline are
> documented in [`authentication.md`](./authentication.md). This
> doc covers profile and identity: tiers, the user row, and kind:0.

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

How each tier signs in — the signer choices and the session
cookie — is covered in [`authentication.md`](./authentication.md).

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

## What we do not do

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
