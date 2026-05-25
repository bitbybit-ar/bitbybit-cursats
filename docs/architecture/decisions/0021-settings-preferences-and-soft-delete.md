# 0021. Settings: preferences + soft-delete

- **Date**: 2026-05-14
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Decision › `locale` | Spelled out the mechanism behind "applied on next sign-in": seed `users.locale` from the sign-in locale on **account creation**, and have the auth route return the row's stored locale so the sign-in redirect lands the user in their preferred language. | The original ADR stated the intent but left the mechanism unimplemented — a returning user who saved `en` still landed on the Spanish URL, and a new account was always created as `es` regardless of the language used to sign up. |
| 2026-05-14 | — | Initial version. | Pin the user-preferences and account-deletion data model before the settings UI ships so a future contributor can find the decision next to the code change instead of digging through commit messages. |

---

## Context

The settings page got a sidebar shell in PR #10 with five
sections: Profile (wired), Payout (wired), Preferences,
Notifications, and Danger zone. The last three were placeholder
panels for a follow-up — this is that follow-up.

The arena project (sister repo) already implements the same three
sections. Cursats borrows the pattern with two adjustments:

- **Notification kinds differ.** Arena tracks challenge/proof/
  badge events; cursats has `order.paid` and `sale.received`
  only.
- **Theme is not a per-account preference.** Both projects use
  `next-themes`/localStorage for theme; arena's settings panel
  exposes a theme dropdown but it still writes to localStorage,
  not to the user row. Cursats keeps theme entirely in the
  navbar (per ADR-implicit decision in PR #10's revised
  preferences copy: the navbar toggle is the source of truth,
  the settings page only stores **default locale**).

## Decision

Three additive columns on the `users` table (migration
[`0008_user_preferences.sql`](../../../drizzle/0008_user_preferences.sql)):

```sql
ALTER TABLE users ADD COLUMN locale varchar(2) NOT NULL DEFAULT 'es';
ALTER TABLE users ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN deleted_at timestamp;
```

### `locale`

- Two-letter language code: `'es'` or `'en'`.
- Default `'es'` matches the existing routing default
  (next-intl `defaultLocale: "es"`).
- Read by the settings page's Preferences panel and surfaced as
  a dropdown.
- **Seeded on account creation** from the locale the user signed
  in with the first time. The sign-in client sends that locale in
  the signed `cursats_locale` tag; `POST /api/auth/nostr` passes it
  to `ensureUserForPubkey`, which writes it onto the new row. A
  brand-new English visitor therefore gets `locale = 'en'`, not the
  `'es'` column default. The seed runs only on insert — a returning
  user's row already exists, so the value they saved in Preferences
  is never overwritten by the locale they happen to sign in from.
- The row is the **source of truth** for preferred language.
  `POST /api/auth/nostr` reads it back after ensure/refresh and
  returns it as the *effective locale*; the session JWT is minted
  with that value too.
- Applied on **next sign-in**, not immediately — the navbar's
  locale switch is the session-only override and we don't want
  saving Preferences to yank the URL out from under the user.
  Concretely, after a successful sign-in the client redirects to
  the effective locale (`router.push(next, { locale })`), and the
  already-signed-in `/sign-in` bounce reads `users.locale` (newer
  than the JWT when Preferences changed mid-session) before
  redirecting. So a seller who saved `en` lands on `/en/…` even
  when they open the Spanish sign-in URL.

### `notification_prefs`

- Shape: `Record<notification_kind, boolean>`. Keys are the
  cursats notification kinds (`order.paid`, `sale.received`
  today; new kinds are simply added to the union and the form
  picks them up).
- Missing key or `true` = enabled (the user opts in by default).
- `false` = the kind is filtered out in
  `lib/notifications.ts:emitNotification` before the
  `notifications` row insert.
- Merged on top of the existing row in `updateUserProfile` so a
  client sending just `{ "order.paid": false }` doesn't blank
  out other opt-outs.
- The `notifications` table is unchanged — opt-out happens at
  emission time, not at the table level. Historical
  notifications never disappear.

### `deleted_at` + soft-delete

- Set by a new `DELETE /api/settings` endpoint protected by the
  same NIP-98 re-sign envelope as the payment-destination
  PATCH path (URL + method + body hash + cursats_action tag).
- The handler scrubs PII (`display_name` to placeholder,
  `bio`/`avatar_url`/`banner_url`/`cbu`/`alias`/`lightning_address`/
  `notification_prefs` to null/empty), sets `active = false`,
  stamps `deleted_at`, and clears the session cookie.
- The row stays. Foreign keys on `offerings.user_id`,
  `orders.user_id`, and `admin_audit_log.user_id` remain valid.
- Buyer surfaces already filter by `users.active = true`, so a
  deleted user's offerings disappear from discovery without any
  cascade work.
- No re-sign-up path in v1: a deleted user trying to sign in
  again will hit `ensureUserForPubkey` which we expect to
  refuse `deleted_at IS NOT NULL` rows in a follow-up. For now
  the row is `active = false`, which the proxy-layer auth check
  already treats as unauthenticated.

## Consequences

**Positive:**

- Sellers can pick a default language without losing the
  ability to read en-language content mid-session.
- Buyers and sellers can mute notification kinds they don't
  care about (e.g. a seller who already watches `/orders`
  doesn't need a bell ping for every sale).
- Account deletion is a real flow with a confirmation modal +
  re-sign, not a `mailto:support`.
- All three new columns are nullable-or-defaulted, so the
  migration is purely additive.

**Negative / accepted trade-offs:**

- **Theme is per-device, not per-account.** A seller who likes
  dark mode on their laptop and light mode on their phone
  doesn't have to change anything; one who wants the same mode
  everywhere will be surprised that the Preferences panel
  doesn't carry theme. We add an in-panel hint pointing them
  at the navbar.
- **`notification_prefs` is missing-equals-enabled.** A future
  kind added server-side starts enabled for every existing
  user. That's the desired UX (don't silently drop pings on
  users), but it does mean a user has to revisit Preferences
  to discover new kinds.
- **Soft-delete leaves the row.** Audit-log queries that show
  the user's pubkey will keep doing so. Re-signing-up with the
  same pubkey is blocked but the public storefront
  (`/{slug}`) returns 404 because the `active` filter catches
  it. We accept this in v1 — true GDPR-style erasure (drop
  the row + cascade) is a follow-up.

**Out of scope:**

- Theme persistence per account.
- Hard-delete cascade. Soft-delete is enough for the v1 ask.
- Re-sign-up with the same pubkey after delete. The path is
  refused; lifting the refusal needs a separate UX call.
- Buyer-side notification kinds beyond `order.paid` and
  `sale.received`. Adding a new kind is just a one-liner in
  `lib/schemas/notifications.ts` plus an i18n row pair.

## References

- ADR [0014](0014-marketplace-open-to-all-logged-in-users.md) —
  the user row model this builds on.
- Arena's settings page (sister-repo `bitbybit-arena`) — the
  pattern donor.
- Migration [`0008_user_preferences.sql`](../../../drizzle/0008_user_preferences.sql).
