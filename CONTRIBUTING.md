# Contributing

> **Status:** Active
> **Last updated:** 2026-05-12

---

## Table of Contents

1. [Before you start](#before-you-start)
2. [Local development](#local-development)
3. [Making changes](#making-changes)
4. [Commit messages](#commit-messages)
5. [Pull requests](#pull-requests)
6. [Architecture decisions](#architecture-decisions)
7. [Code of conduct](#code-of-conduct)
8. [Reporting a vulnerability](#reporting-a-vulnerability)
9. [Open source license](#open-source-license)

---

## Before you start

- Open an issue describing the change before sending a PR for
  anything larger than a typo. Alignment first, code second.
- Read `docs/architecture/overview.md` to understand the
  architecture (multi-tenant marketplace, two payout rails — Wapu
  ARS and direct sats via Lightning Address, in-app receipt +
  optional Nostr DM delivery).
- Read the foundational ADRs in `docs/architecture/decisions/`
  before proposing changes that touch settlement, the catalog
  schema, the deployment model, the payment flows, or the
  notification channel.
- Read the project README for setup.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

(Pending the initial scaffold.)

## Making changes

- **Payment surfaces are server-only.** Wapu API keys and
  settlement logic must live in API routes or server-only modules.
  Never in client components. Use `NEXT_PUBLIC_*` only for
  non-secret display values.
- **No webhooks — verify by polling.** Both rails are confirmed by
  polling, never a webhook: a `wapu_ars` order polls its Wapu
  deposit transaction and a `direct_lightning` order polls the
  seller's LUD-21 `verify` URL, both via `/api/orders/[orderId]`.
  The `wapu_ars` seller payout leg is polled by the settlement cron
  (`/api/cron/wapu-settlements`). Decision in ADR
  `0025-wapu-poll-driven-two-leg-rail.md`.
- **Two payout rails — do not add a third.** Cursats supports Wapu
  (sats → ARS to a CBU/alias) and direct sats to a seller's
  Lightning Address (ADR
  `0015-sats-settlement-rail.md`, superseding the rail-count
  clause of ADR `0002-settlement-via-wapu.md`). The Lightning
  rail requires the seller's LN-address provider to support
  LUD-21 — the settings PATCH mints a 1-sat probe invoice and
  rejects providers that don't advertise a `verify` URL. If you
  believe a third rail is needed, write a superseding ADR first.
- **Do not introduce email delivery.** The receipt page is the
  canonical channel; Nostr DMs are the optional push (ADR
  `0006-nostr-and-inapp-delivery.md`). If you believe email is
  needed, write a superseding ADR first.
- Translate every user-facing string in `messages/es.json` and
  `messages/en.json`. No hardcoded copy in components.
- Use existing design tokens from `styles/_theme.scss`. If you
  need a new token, add it to the theme map; never hardcode a
  hex.
- One `<h1>` per page.
- For each doc you touched, append a row to that doc's
  `## Change Log` and update its `Last updated` date.
- For product-visible changes, also append a bullet under
  `## [Unreleased]` in the **root** `CHANGELOG.md`.

## Commit messages

- Imperative mood: "Add Wapu webhook signature check", not "Added
  the signature check".
- One concern per commit. Refactors and feature work do not share
  a commit.

## Pull requests

- Reference the issue.
- Describe the user-visible change in the PR body.
- Run `npm run build` locally and confirm there are no TypeScript
  or ESLint errors.
- For payment-path changes: describe how you tested with the Wapu
  sandbox (or live, if applicable) and what edge cases you
  exercised (invoice expiry, webhook retry, cancellation, NWC
  pull failure).
- For notification-path changes: describe how you tested DM
  delivery (which relays, which client) and what happens when
  relays are offline.

## Architecture decisions

Anything that changes how the app is structured, deployed, or
secured needs an ADR in `docs/architecture/decisions/`. Copy
`template.md`, fill it in, link it from the PR. Decisions that
override an existing ADR must mark the prior ADR as **Superseded
by [NNNN]**.

## Code of conduct

We are a small group building together. The bar is simple:
**be kind, be honest, be useful**.

### Expected behavior

- Treat others with respect, regardless of experience, identity,
  or background.
- Assume good faith. If something reads wrong, ask before
  assuming.
- Disagree with ideas, not with people.
- Credit others' work when you build on it.

### Unacceptable behavior

- Harassment, insults, or personal attacks.
- Discrimination or exclusion based on identity.
- Sharing others' private information without consent.
- Sustained disruption of discussion.

### Enforcement

Report concerns to the project maintainers via GitHub or directly
to a team member. Reports stay confidential. Maintainers may warn,
mute, or ban contributors who break this code.

### Scope of conduct

This applies in all project spaces — issues, PRs, commits, chats
— and when representing the project in public.

## Reporting a vulnerability

Cursats handles real money: it generates Lightning invoices,
receives webhooks that trigger ARS payouts, holds buyer-granted
NWC permissions when auto-renewal is on, and signs encrypted
Nostr DMs to buyers. Vulnerability reports are taken seriously.

If you find a security issue:

1. **Do not open a public GitHub issue.**
2. Email the maintainers via the contact information on
   <https://github.com/bitbybit-ar> or open a private security
   advisory on the repository.
3. Include enough detail to reproduce: URL, steps, expected vs
   actual behavior, your environment, and (for payment-path
   issues) the Wapu transaction IDs involved if any.

We aim to acknowledge reports within 72 hours and to ship a fix
or mitigation within a reasonable window depending on severity.

### Security scope

In scope:

- The Cursats source code in this repository.
- The default deployment at `cursats.bitbybit.com.ar`.
- The Wapu integration code paths (invoice creation, webhook
  signature verification, ARS payout triggers).
- The NWC integration code paths (connection-string storage,
  budgeted pull payments, retry and cancellation logic).
- The notification and delivery code paths: in-app receipt URL
  generation, signed download URL generation, redemption-code
  generation, Nostr DM signing and publishing.

Out of scope:

- Wapu's own service — report to <https://wapu.app/>.
- Forked deployments by other merchants — report to that merchant.
- Findings against third-party services we link to.
- Theoretical issues with no demonstrated impact.

### Hardening already in place

- HTTPS-only via Vercel, HSTS preload header set.
- The settlement cron is guarded by a `CRON_SECRET` bearer token;
  the manual sync endpoint requires a signed-in session.
- Secrets (Wapu API key, the session JWT signing key, the Postgres
  connection string) live in Vercel environment variables and never
  reach the client.
- Receipt-page `orderId`s are opaque, unguessable identifiers
  with ≥128 bits of entropy.
- Signed download URLs expire after 24 hours and are single-use.
- Outgoing Nostr DMs are NIP-44 encrypted to the buyer's pubkey.
- Security headers: CSP, X-Frame-Options DENY,
  X-Content-Type-Options nosniff, Referrer-Policy
  strict-origin-when-cross-origin, Permissions-Policy locks down
  camera/mic/geolocation.
- All external links open in a new tab with
  `rel="noopener noreferrer"`.

## Open source license

By contributing you agree your contributions are licensed under
the project's open-source license.
