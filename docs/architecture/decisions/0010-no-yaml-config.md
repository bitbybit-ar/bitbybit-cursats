# 0010. Remove `merchant.yaml`; nothing meaningful is left in it

- **Date**: 2026-05-06
- **Status**: Accepted (supersedes ADR [0004](0004-static-config-deployment.md) for the configuration mechanism, not the deployment model)
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Decision | Dropped `ADMIN_PUBKEYS` and `NSEC` from the config and migration tables — the platform-admin feature and the server Nostr signing key were removed as dead code. The no-YAML decision is unchanged. | Those env vars no longer exist; the tables must not list them as current config. |
| 2026-05-06 | — | Initial version. | Record where every former `merchant.yaml` field lives now, so the next agent or developer does not waste time looking for a file that no longer exists. |

---

## Context

`merchant.yaml` was the v0 configuration mechanism (ADR
[0004](0004-static-config-deployment.md)). It carried, at one
point or another:

- Merchant identity (name, domain, social links).
- Branding pointers (logo path, colour primary).
- Payment destination (CBU or alias).
- Feature gating (`features.autorenewal`).
- Admin authorisation (`admin_pubkeys`).
- The full offering catalog.

A series of decisions in May 2026 dismantled this:

- **Catalog and CBU/alias and the autorenewal toggle** moved to
  Postgres (ADR [0009](0009-offerings-and-settings-in-database.md)),
  edited from the panel (ADR [0008](0008-merchant-admin-dashboard.md)).
- **Admin pubkeys** moved to an env var (`ADMIN_PUBKEYS`) for
  bootstrap reasons documented in ADR 0008.
- **Merchant identity, social links, branding tokens, and copy**
  stay in code — but in the *correct* place: SCSS for tokens,
  next-intl JSON for copy, a `lib/merchant.ts` TS module for the
  merchant identity object. None of these belong in YAML.

What remains in `merchant.yaml` after all of the above: nothing.
A YAML file with no contents is not a configuration mechanism, it
is a footgun. The audience cannot safely edit YAML anyway (see
ADR 0008 context); leaving an empty file in the repo invites
"someone" to add a field back and rebuild the brittle layer we
just dismantled.

## Decision

`merchant.yaml` is removed from the repo. There is no
YAML-shaped configuration surface in Cursats.

The new model has three layers, each with one editor and one
editing surface:

| Layer | Edited by | Lives in |
|---|---|---|
| Branding tokens | the developer who forks | `styles/_theme.scss` |
| Page copy, FAQ, terms, privacy | the developer who forks | `messages/{es,en}.json` (next-intl) |
| Merchant identity, social links | the developer who forks | `lib/merchant.ts` (TS module exporting an object) |
| Secrets (Wapu key + host, cron secret, auth secret, DB URL) | the deployer | env vars |
| Offerings | the merchant | Postgres `offerings` table, panel CRUD |
| CBU, alias, autorenewal toggle | the merchant | Postgres `settings` row, panel form |
| Orders, sessions, students | nobody | Postgres, system-managed |

Migration map for anyone who remembers a former YAML field:

| Former `merchant.yaml` field | New home |
|---|---|
| `merchant.name`, `merchant.domain` | `lib/merchant.ts` |
| `merchant.cbu`, `merchant.alias` | `settings` row, panel `/configuracion` |
| `merchant.email` | removed entirely (ADR 0006 — no email integration) |
| `theme.primary`, `theme.logo` | `styles/_theme.scss`, `public/icons/` |
| `features.autorenewal` | `settings.features_autorenewal`, panel toggle |
| `admin_pubkeys` | removed — no platform-admin feature in v1 |
| `catalog[*]` | `offerings` table, panel CRUD |

## Consequences

### Positive

- One mental model: each piece of state has exactly one editor
  and exactly one editing surface. No "is this in the YAML or
  the DB?" ambiguity.
- The audience-friendly path (panel) and the developer-friendly
  path (code + env) do not overlap. Either you are touching the
  repo or you are using the panel; never both for the same field.
- The repo contains no whitespace-sensitive configuration. The
  next contributor cannot accidentally break a deployment by
  mis-indenting a YAML key.
- The mission framing in `docs/about/mission.md` becomes honest:
  "developer forks once and deploys; merchant runs everything
  from the dashboard."

### Negative

- A reader cannot see the merchant's catalog or payout details by
  reading the repo. They have to query the DB or open the panel.
  Acceptable: the catalog is operational data, not source.
- Bootstrap is now strictly two-step: deploy with empty DB, then
  log into `/panel` to seed offerings and settings. This must be
  documented in onboarding.
- The very first deploy renders `/panel/configuracion` with empty
  CBU/alias fields. Buyers cannot complete a purchase until those
  are filled. The panel surfaces this prominently as a "complete
  setup" banner.

### Neutral

- A future ADR may revisit "should branding tokens be panel-
  editable?" Not in v1; the current scope is "merchant manages
  what they sell and where money goes; developer manages what
  the site looks like." If that boundary needs to move, it will
  be a deliberate decision.

## Alternatives considered

- **Keep an empty `merchant.yaml` as a placeholder for future
  fields.** Rejected: invites the next contributor to add a
  field back and re-introduce the editing-surface ambiguity.
  Better to delete and re-create later if a real need appears.
- **Replace YAML with TOML or JSON.** Rejected: the problem was
  not the syntax, it was the audience mismatch and the fact that
  every former field has a better home elsewhere.
- **Keep `merchant.yaml` for branding only and delete everything
  else.** Rejected: branding is already in `styles/_theme.scss`
  (tokens) and `public/icons/` (logo). YAML for branding would
  be a third place for the same kind of value.

## References

- ADR [0004](0004-static-config-deployment.md) — superseded for
  the configuration mechanism; still authoritative for the
  single-tenant deployment posture.
- ADR [0006](0006-nostr-and-inapp-delivery.md) — explains why
  `merchant.email` no longer exists.
- ADR [0008](0008-merchant-admin-dashboard.md) — the panel that
  edits what used to be in `merchant.yaml`.
- ADR [0009](0009-offerings-and-settings-in-database.md) —
  defines the DB tables that absorbed the catalog and settings.
