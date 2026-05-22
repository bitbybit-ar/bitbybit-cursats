# 0012. Pivot from single-tenant tool to multi-tenant marketplace

- **Date**: 2026-05-08
- **Status**: Superseded by [0014](0014-marketplace-open-to-all-logged-in-users.md)
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | — | Note: the `ADMIN_PUBKEYS` / `PLATFORM_ADMIN_PUBKEYS` references here were removed as dead code (this ADR is already superseded by ADR 0014). | The env vars and code no longer exist. |
| 2026-05-09 | Status | Marked Superseded by ADR 0014. | The merchant-only access model has been replaced — any signed-in user is implicitly a creator now. The per-merchant ownership FK structure survives. |
| 2026-05-08 | Status, Decision | Status flipped from Proposed to Accepted; AR alias validation rule (BCRA 6–20 chars, `[A-Za-z0-9.-]`) folded into the merchant signup contract; AFIP posture deferred to a follow-up review; webhook payload question deferred and flagged at the code site. | Wapu confirmation + the open-question answers from 2026-05-08 unblock the rewrite. |
| 2026-05-08 | — | Initial draft. | Wapu's `direct-payment` API (PR wapu-app/wapu-cli#7) lets a single platform Wapu account route per-invoice payouts to arbitrary merchant aliases without ever custodying funds. That removes the only blocker we had against turning the project into a marketplace, so the architectural decision needs to be recorded before any code moves. |

---

## Context

ADRs [0004](0004-static-config-deployment.md),
[0008](0008-merchant-admin-dashboard.md), and
[0009](0009-offerings-and-settings-in-database.md) collectively pin
a **single-tenant** model: one developer forks the repo, sets env
(`ADMIN_PUBKEYS`, `WAPU_API_KEY`, `CBU`/alias in
`settings`-as-singleton), and deploys their own storefront. One
deployment, one merchant, one CBU.

Two facts have shifted since:

1. **The product audience does not match the deployment model.** A
   piano teacher in Buenos Aires is exactly the persona we wrote
   about in `docs/about/mission.md`, and that persona will not
   `git fork`, set up a Vercel project, or configure env vars.
   "Developer forks for the merchant" is plausible for the
   first dozen merchants and unsustainable for the next hundred.
   Network effects (one URL where buyers discover multiple
   teachers) compound the problem.

2. **The Wapu blocker is gone.** The single-tenant model existed
   partly because we assumed one Wapu API key implied one CBU
   destination. Wapu's `direct-payment` API
   (`POST /transactions/direct-fiat/tentatives` →
   `POST /transactions/direct-fiat/tentatives/{uuid}/funding`,
   landed in `wapu-app/wapu-cli#7` and confirmed in chat with
   Wapu dev on 2026-05-08) takes a per-invoice destination
   `alias`, returns a Lightning funding instruction, and credits
   ARS straight to that alias when the buyer pays. The platform
   never custodies funds.

The combination: we can now run **one deployment, many
merchants**, where each merchant brings only their Wapu-routable
alias (or CBU) and a Nostr identity.

## Decision

Pivot Cursats to a multi-tenant marketplace:

- A new `merchants` table keys every merchant by their Nostr
  pubkey, with their slug, display name, payout alias/CBU, and
  the per-merchant `features_autorenewal` flag.
- Every offering belongs to exactly one merchant
  (`offerings.merchant_id`).
- The deployment-level `settings` singleton goes away. Per-
  merchant fields move into `merchants`. Truly platform-wide
  knobs (today: none) would live in env.
- The `ADMIN_PUBKEYS` env var stops being the panel gate. Anyone
  who can sign in with Nostr and claim a slug becomes a
  merchant. A new `PLATFORM_ADMIN_PUBKEYS` env (deprecation-
  free rename of the concept) gates a separate moderation
  surface only.
- The merchant panel at `/[locale]/panel/*` stays, but every
  read and write scopes to `session.merchant_id`. A merchant
  can never see or mutate another merchant's offerings, orders,
  students, or settings.
- A merchant's public storefront lives at `/[locale]/m/[slug]`
  (their offerings, their bio, their image). The home page at
  `/[locale]` becomes a global discovery surface across all
  active merchants. Offering detail moves to
  `/[locale]/m/[mslug]/c/[oslug]` so two merchants can share
  the same offering slug.
- Checkout switches to Wapu's direct-payment flow. Each invoice
  is created with the merchant's stored alias as the
  destination; the buyer's sats arrive as Lightning funding to
  Wapu, and Wapu credits ARS straight to the merchant's
  alias. The platform never touches the funds.
- The mission, README, and CHANGELOG get rewritten to reflect
  the new posture.

This ADR explicitly **supersedes the single-tenancy half** of
ADRs 0004, 0008, and 0009. The other halves (no `merchant.yaml`,
admin panel exists at `/panel`, offerings-in-Postgres) survive
unchanged.

## Consequences

### Positive

- One deployment serves many merchants. Buyer URL is shareable
  in marketing (one site, not N).
- Onboarding becomes "sign in with Nostr, pick a slug, paste your
  alias" — no fork, no env config, no Vercel project per
  merchant.
- Platform never custodies ARS or sats. The
  Wapu-direct-payment path means the buyer's payment lands in
  the merchant's CBU directly. We are not a money-services
  business in the AFIP sense.
- Discovery: a single home page across all merchants is a
  much stronger funnel than N forked deployments.
- Existing infrastructure carries over: NIP-98 auth,
  signWithPrompt for CBU re-sign, Blossom image upload, the
  panel UI, the receipts/DM flow — all multi-tenant from the
  first edit because they are pubkey-keyed already.

### Negative

- One deployment going down takes every merchant's storefront
  down. The single-tenant model split that risk; we
  consolidate it. Mitigation: aggressive uptime monitoring on
  the deployment, conservative deploys.
- Slug squatting becomes a real problem. We need a small
  reservation flow plus platform-admin take-down power for
  bad-faith claims (impersonation, brand abuse).
- Content moderation is now ours to run, even if we mostly
  delegate to "the merchant publishes whatever they want" by
  default. AFIP, copyright takedowns, and abuse reports will
  eventually arrive; the platform-admin role is the answer,
  but its UI is out of scope for the first cut.
- Wapu becomes a harder dependency. Single-tenant let a
  merchant pick a different rail later by forking; the
  marketplace path locks us to the rail we wire up. ADR
  [0002](0002-settlement-via-wapu.md) (Wapu-only settlement)
  remains the policy.
- Migration cost: every Postgres consumer (offerings reads,
  settings reads, panel pages, the checkout route, the webhook
  handler, the admin API routes, the test fixtures) needs to
  be re-keyed by `merchant_id`. There are no production users
  of Cursats yet, so the cost is "rewrite-shaped" not
  "migration-shaped" — but it is real engineering time.

### Neutral

- The fork-for-friction story (ADR
  [0010](0010-no-yaml-config.md)) survives as the
  *self-hosting* story for merchants who want sovereignty.
  Anyone can still fork and run their own single-tenant Cursats;
  the marketplace is the default at `cursats.bitbybit.com.ar`.
- `image_url` storage via Blossom (ADR
  [0011](0011-image-storage-via-blossom.md)) is unaffected —
  every merchant signs their own kind:24242 events for their
  own offering images.
- The audit log already keys every row by actor pubkey, so the
  multi-tenant rewrite picks it up for free.

## Alternatives considered

- **Stay single-tenant; add a "deploy your own Cursats" template
  button.** Solves the deploy-friction half of the problem (no
  manual env setup) without inheriting marketplace risk
  (custody, moderation, slug squatting). Rejected because it
  does not solve the discovery half — a buyer still has to
  *know* a particular teacher's URL — and the audience least
  likely to read a deploy README is the audience we are
  building for.
- **Multi-tenant via per-merchant subdomains
  (`maria.cursats.bitbybit.com.ar`).** Stronger merchant-as-
  brand story than path-based routing. Rejected for v1
  because Vercel-DNS subdomain provisioning per merchant adds
  scope we can't justify before validating demand. Path-based
  `/m/[slug]` is reversible — we can add subdomains later as a
  redirect target.
- **Multi-tenant with a per-merchant Wapu account (Wapu's first
  option from the chat).** More isolation per merchant, but
  the platform has to manage N Wapu account credentials and
  the merchant has to onboard with Wapu before they can sell.
  Rejected for v1 because direct-payment in a single platform
  Wapu account is dramatically less work for both sides.
- **Defer the pivot until after the hackathon.** Tempting given
  scope. Rejected because the post-hackathon migration cost
  is much higher than the pre-launch rewrite cost — every
  merchant we onboard under the single-tenant model is a
  forked deploy we eventually have to back-port.

## References

- Wapu direct-payment CLI PR:
  https://github.com/wapu-app/wapu-cli/pull/7
- Conversation with Wapu dev (Andy Creed), 2026-05-08:
  recommended the single-master-account direct-payment shape
  for our use case.
- Implementation plan:
  `~/.claude-personal/plans/marketplace-pivot.md`.
- ADRs that are partially superseded by this one:
  [0004](0004-static-config-deployment.md),
  [0008](0008-merchant-admin-dashboard.md),
  [0009](0009-offerings-and-settings-in-database.md).
