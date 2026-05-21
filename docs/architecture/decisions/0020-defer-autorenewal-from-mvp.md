## 0020. Defer auto-renewal from the MVP

- **Date**: 2026-05-14
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-21

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-21 | Decision, Consequences | Drop the `users.features_autorenewal` column outright (migration `0009_drop_features_autorenewal.sql`) and remove the field from `UpdateUserProfileSchema` and the PATCH response. | The hackathon judges will be reading the schema and the API surface. Carrying a dead boolean column plus an input field with no UI invited the same "what does this do?" confusion the original ADR was supposed to remove. A future autorenewal feature will need a fresh migration anyway — the original shape probably won't survive. |
| 2026-05-14 | — | Initial version. | Record that the autorenewal toggle is gone from MVP scope before the settings refresh ships, so a future contributor can find the decision next to the code change instead of digging through commit messages. |

---

## Context

ADR [0005](0005-prepaid-default-autorenewal-optin.md) introduced
**auto-renewal** as an opt-in feature gated by the
`users.features_autorenewal` runtime flag (per ADR 0009's "settings
in Postgres" move). The settings page exposed the toggle; the
checkout was supposed to render an additional auto-renewal CTA when
the seller had it on; the NWC client + cron handler + encrypted-
secrets storage were "deployed but dormant" until a seller flipped
it on.

In practice none of that wiring was finished by the time the
broader scope of cursats MVP solidified:

- No NWC client implementation landed.
- No cron worker for the renewal sweep exists.
- No encrypted-secrets storage was implemented.
- The checkout's "second button" was never wired — both branches
  of the buy CTA pointed at the same one-shot flow.
- Sellers reading the toggle had no way to know it didn't do
  anything; flipping it changed the row but nothing else.

The hackathon brief is one-shot Lightning purchases for educational
content. Subscriptions and renewals don't appear anywhere in the
buyer or seller journey we're shipping. Carrying a dormant toggle
that mis-promises a feature is worse than not showing it at all.

## Decision

**Drop the autorenewal toggle from the v1 UI.** Specifically:

1. The settings form no longer renders the `features_autorenewal`
   checkbox. The legend group it lived under ("Funciones") goes
   away too.
2. The form no longer sends `features_autorenewal` in the PATCH
   payload to `/api/settings`.
3. The PATCH route's response no longer echoes the flag back.

**Drop the column from the schema.** Migration
`0009_drop_features_autorenewal.sql` removes `users.features_
autorenewal` outright. The original ADR (see Change Log) kept the
column on the theory that a future re-launch could land cleanly;
in practice the field invited "what does this do?" questions for
anyone reading the schema and the API write surface still accepted
it. A future autorenewal feature will need a fresh migration
regardless — the original shape probably won't survive.

**Drop `features_autorenewal` from `UpdateUserProfileSchema`.** The
API no longer accepts writes to the flag, so an attacker with a
stolen session cookie cannot silently enable a feature that does
not exist. The PATCH response no longer surfaces the field either.

## Consequences

**Positive:**

- The settings page stops promising a feature that doesn't work.
- One fewer surface for sellers to misconfigure.
- The next contributor reading the codebase finds an explicit
  "deferred, not in MVP" decision instead of half-wired code with
  unclear status.

**Negative / accepted trade-offs:**

- **Re-introducing autorenewal needs a fresh migration.** That's
  fine; the original column shape (a single boolean) was unlikely
  to survive a real implementation anyway — anything past v1 will
  need NWC connection identifiers, an interval, last-charged
  timestamps, etc.
- **i18n strings removed.** `settings.form.autorenewal*` and
  `settings.form.featuresLegend` are gone from
  `messages/{es,en}.json`. Re-introducing the feature means
  re-adding those (or new) keys.
- **CHANGELOG note required.** This is user-facing — the
  settings page lost a control between releases. Documented in
  the Unreleased section.

**Out of scope:**

- Removing `lib/checkout` or webhook code that branches on the
  flag — there isn't any. The flag was dormant; removing the
  toggle removes the only place it was read.
- Subscription-style payment plumbing in general. v1 is one-shot
  Lightning purchases only.

## Supersedes

- The autorenewal half of ADR
  [0005](0005-prepaid-default-autorenewal-optin.md). The
  pre-paid one-shot model from that ADR is the only payment
  posture we ship.
