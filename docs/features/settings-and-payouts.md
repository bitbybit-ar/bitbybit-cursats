# Settings and payouts

> **Status:** Active
> **Last updated:** 2026-05-23

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-23 | What lives in `/settings`, Two tiers of fields | Folded the Notifications tab into Preferences (single Save), dropped the informational Theme block, and noted the payout notification toggles. | Mobile/UX pass — fewer tabs, and theme was never persisted server-side. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — describe the settings surface, the two tiers of fields, the NIP-07 re-sign flow, and the LUD-21 probe. |

---

## Table of Contents

1. [What lives in `/settings`](#what-lives-in-settings)
2. [Two tiers of fields](#two-tiers-of-fields)
3. [The re-sign flow](#the-re-sign-flow)
4. [The LUD-21 probe (LN-rail entry)](#the-lud-21-probe-ln-rail-entry)
5. [Switching payout methods](#switching-payout-methods)
6. [Audit trail](#audit-trail)
7. [What we deliberately do not do](#what-we-deliberately-do-not-do)

---

## What lives in `/settings`

The seller's single configuration surface at
`/[locale]/settings`. Grouped into three sections:

1. **Identity** — `slug`, `display_name`, `bio`, `avatar_url`.
2. **Payout** — `payout_method` (the rail picker), plus the
   per-rail destination fields: `cbu`, `alias` (Wapu rail);
   `lightning_address` (LN rail).
3. **Preferences** — locale default plus the notification toggles
   (buyer `order.paid`, seller `sale.received`, and the Wapu payout
   states `payout.pending` / `payout.released` / `payout.failed`),
   saved together with one Save. Theme is **not** here — it lives in
   the navbar toggle and persists per-device. Account deletion lives in
   its own **Danger zone** tab.

The page renders both rails' destination fields all the time, so
a seller can prepare the *other* rail's fields before flipping
the picker. Only the fields for the currently active rail
affect order routing.

## Two tiers of fields

Every editable field falls into one of two tiers:

### Tier 1 — free edits

`slug`, `display_name`, `bio`, `avatar_url`, locale, notification
preferences.

These can be saved with just the session cookie. The
session-cookie alone is sufficient because the worst-case
outcome of an attacker editing them is "the user's storefront
looks weird" — no money flows through these fields.

### Tier 2 — re-sign required

`cbu`, `alias`, `lightning_address`, `payout_method`.

These are the **payment-destination fields**. A successful
PATCH on any of them requires a freshly signed Nostr event
proving the same pubkey re-asserted intent at save time. The
session cookie is necessary but not sufficient — the attacker
would also need to be holding the private key, which means
they were already the user.

Why this matters. If a stolen session cookie were enough to
silently swap a seller's CBU for the attacker's, the next
buyer's pesos would land in the wrong bank account. Cursats
treats every payment-destination edit as a fresh
authorisation step, not just a fresh request.

The tier-2 boundary is **enforced server-side** (a request with
a session cookie but no re-sign event is refused, no matter how
the client fronted the request). The client surfaces the
boundary by prompting for a signer interaction (NIP-07 extension
popup, NIP-46 bunker request, or an nsec re-paste) right before
the save.

## The re-sign flow

The PATCH lives at `app/api/settings/route.ts`; the signed
payload is built and verified through
`lib/admin/sign-settings-payload.ts`. Step-by-step, when a
seller saves a tier-2 field:

1. User edits the field in `/settings` and clicks Save.
2. Client builds an unsigned Nostr event describing the intent
   ("I am about to PATCH `/api/settings` with this body"),
   including a `created_at`.
3. Client asks the configured signer (extension / bunker /
   pasted nsec) to sign it.
4. Client sends the PATCH with the signed event in the request
   body.
5. Server:
   a. Validates the session JWT (caller is logged in).
   b. Validates the signed event: signature, pubkey matches the
      session, `created_at` is fresh (within a small window).
   c. Validates the event's described intent matches the
      request body (no signing a "change my bio" event and
      submitting a "change my CBU" request).
   d. Runs the field-specific validator. For a Lightning Address,
      this includes the LUD-21 probe (see next section).
   e. On success, writes the row and emits an `admin_audit_log`
      entry (via `lib/admin/audit.ts`). On failure, returns the
      failure reason and leaves the row untouched.

The signer-prompt UX is the same shape as sign-in: the user has
already chosen extension / nsec / bunker; the same path is
re-used. NIP-46 users get a notification on their phone or
remote daemon; nsec users get a clear "we need to re-sign — paste
nsec again" affordance.

## The LUD-21 probe (LN-rail entry)

When the field being saved is `lightning_address`, the server
performs a one-time **live probe** of the address before
accepting it. The probe is what keeps a broken or
non-compliant LN provider from ever ending up on a published
offering.

The probe sequence:

1. Server resolves the LNURL-pay metadata for the address (the
   `.well-known/lnurlp/<name>` JSON document).
2. Server checks the response advertises LUD-21 — specifically,
   it carries a `verify` URL field on its pay-callback response
   shape.
3. Server hits the pay callback for a **1-sat** amount,
   receiving back a BOLT11 invoice and a `verify` URL.
4. Server polls the `verify` URL once and checks it returns the
   expected unsettled shape (the 1-sat invoice was minted but
   not paid — verify must report `{ settled: false }`).
5. On success, the address is written to the user row.
6. On any failure (no LUD-21, provider down, malformed
   response, verify URL returns a wrong shape), the save is
   rejected with an error explaining which step failed.

The 1-sat probe never actually settles. The invoice is minted,
the verify is polled in the unsettled state, and the invoice is
abandoned (lightning invoices that aren't paid simply expire). No
funds move. The probe is purely a contract test of the
provider's API surface.

Reasons for doing this at *save* time, not *checkout* time:

- A seller who gets the address wrong sees a clear error in
  Settings — not in a stuck checkout page that confuses their
  first buyer.
- The probe is amortised over many future orders. Doing it once
  per save is cheap; doing it once per checkout is wasteful.
- The provider's contract is locked in at the moment the seller
  chose them. If the provider later breaks LUD-21, the seller
  notices via failed checkouts and re-tests by re-saving the
  address; they do not get a confusing first-checkout failure
  for an address that worked at save time.

## Switching payout methods

`payout_method` is a single field with one of two values
(`cbu_alias` or `lightning_address`, default `cbu_alias`). A
seller switching rails:

1. Goes to `/settings`.
2. Edits the destination fields for the new rail (if not already
   filled in).
3. Flips the `payout_method` picker.
4. Re-signs.
5. Saves.

After save, **future orders** are routed via the new rail (each
order snapshots its `rail` — `wapu_ars` or `direct_lightning` —
from the seller's then-current `payout_method`). **In-flight
orders** keep their original rail; nothing retroactively
switches. This is the same invariant described in
[settlement-rails — the single dispatch point](./settlement-rails.md#the-single-dispatch-point).

The previous rail's destination fields are **not** wiped on
switch. A seller can flip back to the old rail without re-entering
their CBU or LN address; the fields they had are still there.
Only the picker moves.

## Audit trail

Every successful PATCH to `/settings` writes a row to
`admin_audit_log`:

- Timestamp.
- Actor pubkey.
- Route (`/api/settings`).
- Action (the field that changed).
- Payload diff (old → new), with secrets redacted (e.g., the
  exact CBU value is recorded as a hash for forensic match, not
  the cleartext).

Read-only forever. There is no UI to delete rows. A future
moderation feature can read this log to investigate disputed
payouts.

Decision in ADR
[0021-settings-preferences-and-soft-delete](../architecture/decisions/0021-settings-preferences-and-soft-delete.md).

## What we deliberately do not do

- **No 2FA, no TOTP, no SMS code.** The Nostr re-sign *is* the
  second factor — it requires the private key in the user's
  signer at save time. Adding a separate 2FA channel duplicates
  this without adding security.
- **No email verification.** No emails anywhere; see ADR
  [0006](../architecture/decisions/0006-nostr-and-inapp-delivery.md).
- **No "pending change" buffer.** A save either succeeds atomically
  or fails atomically. There is no "we will start using your new
  CBU in 24h once you confirm via email" delay; the re-sign at
  save time is the confirmation.
- **No autorenewal toggle in v1.** The column and the input
  field are both gone (migration `0009`); see ADR
  [0020-defer-autorenewal-from-mvp](../architecture/decisions/0020-defer-autorenewal-from-mvp.md).
- **No CBU verification beyond format.** Cursats does not call
  the Argentine banking system to confirm the CBU belongs to the
  user. Wapu does that on their end at first-payout time; we
  surface their error if it happens. The CBU format itself is
  validated at save time (digit count, checksum).
