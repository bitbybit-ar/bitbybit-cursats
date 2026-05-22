# 0008. Add a merchant admin dashboard at `/panel`

- **Date**: 2026-05-06
- **Status**: Superseded by [0014](0014-marketplace-open-to-all-logged-in-users.md)
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | — | Note: the `ADMIN_PUBKEYS` env and the admin-dashboard gate described here were removed as dead code (the `/panel` was already superseded by ADR 0014). | The env var and code no longer exist. |
| 2026-05-09 | Status | Marked Superseded by ADR 0014. | The `/panel/*` namespace is gone; creator surfaces moved to top-level routes accessible to every signed-in user. |
| 2026-05-08 | Implementation status | NIP-07 re-sign for CBU/alias landed via `signWithPrompt` ported from arena; PATCH `/api/admin/settings` enforces a NIP-98 signature whose `payload` tag binds to the body sha256, with pubkey-match against the session. | Closes the deferred half of the original ADR; the panel's payment-destination edits now meet the signed-confirmation requirement. |
| 2026-05-06 | — | Initial version. | Pin the panel surface, auth model, and read-vs-write boundaries before any admin code lands so the first-pass implementation does not accidentally expose mutation paths over orders or buyers. |

---

## Context

ADR [0004](0004-static-config-deployment.md) intentionally said *no
admin UI* — merchants fork the repo, edit `merchant.yaml`, and
redeploy. That stance was correct for v0 (catalog-only, no
backend), but does not survive contact with the actual mission.
The audience is *educators*, not developers. A piano teacher in
Buenos Aires cannot safely edit YAML, will not learn `git push`,
and should not need to call the developer who forked the repo
every time a course price changes.

ADR [0007](0007-optional-nostr-buyer-login.md) introduces a
Postgres database for orders and a Nostr-based session model. That
provides the substrate for an admin surface: there is now a place
to *show* (orders, payments, buyers) and a working session
primitive to gate access on.

The right framing is therefore: *who edits what, and from where?*

| Layer | Who | Editable from |
|---|---|---|
| Branding tokens, copy, identity, social links | the developer who forks | code (SCSS, JSON i18n, TS modules) |
| Secrets (Wapu key, NSEC, DB URL, admin pubkeys) | the developer who deploys | env vars |
| Offerings, settings (CBU/alias, autorenewal) | the merchant | the panel (DB-backed) |
| Orders, sessions, students | nobody (system-managed) | not editable |

The dashboard exists to give the merchant a UI for the third row
without ever exposing the others.

## Decision

Cursats ships a merchant admin dashboard at `/[locale]/panel/...`
in v1. Auth is gated by an env var; mutations are scoped narrowly
on purpose; everything is server-rendered so no admin data
crosses to a client bundle.

### Auth

Authentication reuses the Nostr session module from ADR
[0007](0007-optional-nostr-buyer-login.md) (NIP-07 / nsec /
NIP-46, `jose` JWT in an httpOnly cookie). Authorisation is a
*list* of admin pubkeys held in an environment variable:

```text
ADMIN_PUBKEYS=npub1abc...,npub1def...
```

A list — not a single key — so the merchant can grant their
assistant or accountant access without sharing nsec material.

The list lives in env, not in the database, on purpose:
bootstrapping. The very first admin must be able to sign in
*before* any DB row exists; storing admins in the DB requires an
admin to seed it, which requires being an admin. Env breaks the
loop and keeps admin grants under whoever controls the
deployment, not whoever controls the dashboard.

`/panel/*` middleware:

1. Resolve the Nostr session cookie (same as buyer auth).
2. If no session: redirect to `/iniciar-sesion?return=/panel/...`.
3. If the session pubkey is not in `ADMIN_PUBKEYS`: return 404
   (not 403 — do not advertise the surface to non-admins).
4. Render.

### Routes (v1 inventory)

```text
/[locale]/panel                    → overview cards (revenue MTD,
                                     pending orders, recent feed)
/[locale]/panel/ventas             → aggregates over time, CSV export
/[locale]/panel/pedidos            → order list + filters + search
/[locale]/panel/pedidos/[orderId]  → order detail
/[locale]/panel/estudiantes        → identified buyers list + search
/[locale]/panel/estudiantes/[pubkey] → per-buyer detail
/[locale]/panel/ofertas            → offerings list
/[locale]/panel/ofertas/nueva      → create offering
/[locale]/panel/ofertas/[slug]/editar → edit + delete offering
/[locale]/panel/configuracion      → settings (CBU, alias,
                                     autorenewal toggle)

/api/admin/orders                  → list + filter + search
/api/admin/stats                   → aggregates for /panel/ventas
/api/admin/offerings               → CRUD
/api/admin/settings                → read + update (re-sign required
                                     for payment-destination fields)
/api/admin/upload                  → image upload to Vercel Blob
```

### What can be mutated

Mutation scope is deliberately narrow:

- **Orders, payments, buyers — read-only in v1.** No refunds,
  no resends, no marking-as-delivered, no DM-from-the-UI. These
  are partly irreversible and the wrong place to start. Filter,
  search, sort, pagination, and CSV export are read-side and
  remain available.
- **Offerings — full CRUD.** Reversible (the merchant just edits
  again). Schema and storage in ADR
  [0009](0009-offerings-and-settings-in-database.md).
- **Settings — full update**, with one carve-out: any change to a
  *payment-destination* field (CBU, alias) requires a NIP-07
  re-sign at the moment of save. Practically: the panel asks the
  browser extension to sign a one-shot challenge whose payload
  includes the new value; the API verifies that signature against
  the session pubkey before committing the row. Rationale: a
  compromised session cookie cannot quietly redirect future
  settlement to an attacker's bank without a second signature
  from the actual signer device.

### Audit log

Every mutation writes a row to an `admin_audit_log` table:
timestamp, actor pubkey, route, action, payload diff (with
secrets redacted). Read-only forever — there is no UI to delete
rows. The settings page surfaces the most recent N entries so the
merchant can see "I changed the CBU on 2026-05-06."

### Slug

`/panel` (Spanish-default), not `/admin`. Universally legible to
the audience and matches the rest of the Spanish-first surface.

## Consequences

### Positive

- The mission becomes deliverable. A non-technical educator can
  manage offerings, see payments, and update payout details
  without touching files or git.
- Reuses the auth module from ADR 0007 — no second auth system.
- Read/write boundary is explicit and pinned in this ADR, so no
  future PR can quietly add a refund button without a follow-up
  decision.
- NIP-07 re-sign for CBU changes contains the blast radius of a
  stolen session cookie.
- Audit log makes "who changed what, when" answerable on day one.

### Negative

- The panel itself is a real attack surface — session handling,
  CSRF, the upload endpoint, and the settings re-sign all need
  the same scrutiny we already give the Wapu webhook.
- Bootstrap requires the deployer to set `ADMIN_PUBKEYS` before
  the first admin can sign in. Documented in onboarding.
- An admin who loses their nsec loses access until the deployer
  edits the env var. Acceptable for a single-tenant deployment;
  documented.

### Neutral

- A future v1.1 may add scoped write actions (refund flow, resend
  redemption code, send Nostr DM from the UI). Each one is a
  separate decision; this ADR records that they are *not* in v1.
- Per-route permissions (e.g. accountant who can see `/panel/ventas`
  but not `/panel/ofertas`) can be layered on top of `ADMIN_PUBKEYS`
  later without breaking the env-var contract — just add a
  `ADMIN_ROLES` mapping.

## Alternatives considered

- **No dashboard, keep ADR 0004 as-is.** Rejected: forces
  merchants to be developers, which contradicts the mission.
- **Database-backed admin list (`admins` table) with a "first
  signup is admin" rule.** Rejected: race-condition attack on
  first deploy; whoever signs in first owns the deployment.
- **Separate admin login (password / WebAuthn / magic link)
  rather than reusing the Nostr session module.** Rejected: a
  second auth system to test, document, and rotate. Nostr is
  already trusted for buyer identity.
- **Allow refunds and resends in v1.** Rejected for the
  hackathon scope. They are real features that deserve a
  dedicated decision (idempotency, partial refunds, who initiates,
  what the buyer sees) and shipping them with no ceremony invites
  bugs.
- **Skip the NIP-07 re-sign for CBU changes; rely on session
  alone.** Rejected: the CBU is the merchant's *bank account*.
  The cost of a re-sign click is trivial compared to the cost of
  a silent redirection.

## References

- ADR [0004](0004-static-config-deployment.md) — superseded *for
  the catalog and runtime settings* by ADRs 0009 and 0010; this
  ADR introduces the surface that replaces it.
- ADR [0005](0005-prepaid-default-autorenewal-optin.md) —
  autorenewal flag is now a runtime panel toggle stored alongside
  CBU/alias.
- ADR [0007](0007-optional-nostr-buyer-login.md) — provides the
  Nostr session primitive this dashboard reuses.
- ADR [0009](0009-offerings-and-settings-in-database.md) —
  defines the storage this dashboard writes to.
- ADR [0010](0010-no-yaml-config.md) — records the removal of
  `merchant.yaml` and where each former field landed.
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)
  — used both for the session login and for the per-mutation
  re-sign on settings changes.
