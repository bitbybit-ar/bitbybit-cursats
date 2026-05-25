# Automated tests

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Directory layout, Gated staging smoke tests, What the suite covers | Removed the nonexistent `tests/setup.ts` / jest-dom line; documented the NWC staging smoke test alongside Wapu's; added coverage bullets for NWC, crypto, CSP, Blossom, the Wapu client, `orders-params`, the user-row helpers, recommendations, and read-time order expiry. | Several test modules landed after the initial version; the doc now matches the tree. |
| 2026-05-23 | What the suite covers | Added a coverage summary and landed tests for create-course validation, payout math, both Wapu settlement legs, and the cron auth gate. | New tests for the highest-value paths; the doc reflects what is covered. |
| 2026-05-23 | — | Initial version. | The automated test suite (vitest, the unit/integration split, the Neon test branch, the gated Wapu staging smoke tests) existed in the repo but was undocumented. `testing-plan.md` covers the *manual* judge walkthrough only; contributors had no written reference for the automated layer. |

---

## Table of Contents

1. [Scope](#scope)
2. [Test stack](#test-stack)
3. [Directory layout](#directory-layout)
4. [The two suites](#the-two-suites)
5. [Running the tests](#running-the-tests)
6. [The integration database](#the-integration-database)
7. [Gated staging smoke tests](#gated-staging-smoke-tests)
8. [Coverage](#coverage)
9. [Writing a new test](#writing-a-new-test)
10. [What the suite covers](#what-the-suite-covers)

---

## Scope

This document describes the **automated** test suite — the vitest
unit and integration tests under `tests/`. It is the counterpart to
[`testing-plan.md`](../testing-plan.md), which is a **manual** judge
walkthrough of the running UI. The two do not overlap:
`testing-plan.md` tells a human which buttons to click;
this document tells a contributor how the programmatic suite is
structured, how to run it, and what it does and does not cover.

## Test stack

- **Runner**: [vitest](https://vitest.dev) 4 (`vitest.config.ts`).
- **Environment**: `node`. The suite is backend/logic only — there
  are no React component tests — so there is no DOM shim and no
  component-testing libraries (`jsdom`, `@testing-library/*`,
  `@vitejs/plugin-react`) in the tree.
- **Module resolution**: the `@/` alias maps to the repo root.
  `server-only` is aliased to a no-op stub
  (`tests/stubs/server-only.ts`) because vitest already runs in a
  server context — without the stub, any `import "server-only"` would
  throw at import time.
- **Scheduling**: `fileParallelism: false`. Test files run one at a
  time. This is load-bearing for the integration suite — see
  [The integration database](#the-integration-database).

## Directory layout

```text
tests/
├── stubs/
│   └── server-only.ts       ← no-op replacement for the server-only guard
├── unit/                    ← pure, fast, no external services
│   ├── db/schema.test.ts
│   ├── lib/…                ← one test file per lib module
│   └── lib/nostr/…
└── integration/             ← real Postgres (Neon test branch)
    ├── setup.ts             ← testDb, cleanDb(), seedUser()
    ├── api/…                ← route handlers exercised end to end
    ├── db/migrate.test.ts
    └── lib/…
```

Mirror the source tree under `tests/unit` and `tests/integration`
so the test for `lib/foo/bar.ts` lives at a predictable path.

## The two suites

| | `tests/unit` | `tests/integration` |
|---|---|---|
| Speed | Fast (milliseconds) | Slower (network round-trips) |
| Dependencies | None | A real Postgres database |
| Environment | `node` | `node` |
| What it proves | Pure logic, schema parsing, validators, crypto/encoding helpers | DB reads/writes, route handlers, cross-tenant scoping, the order lifecycle |

The integration files carry an explicit `// @vitest-environment node`
docblock. It is redundant now that `node` is the global default, but
kept as a defensive marker: `@neondatabase/serverless` emits a
browser-SQL warning if it ever detects `window`, so these files must
never run under a DOM environment.

## Running the tests

```bash
npm test                 # everything (vitest run)
npm run test:unit        # tests/unit only
npm run test:integration # tests/integration only (serial)
npm run test:watch       # vitest watch mode
npm run test:coverage    # full run with a coverage report
```

`test:unit` needs no setup and is the fast inner-loop command.
`test:integration` and `test:coverage` need the integration database
configured first (next section). The integration script passes
`--fileParallelism=false` explicitly so a partial run behaves the
same as the full suite.

## The integration database

The integration suite talks to a **real Postgres database** — a
[Neon](https://neon.tech) test branch is the recommended target
because branches are cheap to create and throw away.

1. Copy the template and point it at a throwaway database:

   ```bash
   cp .env.test.example .env.test
   ```

   Set `DATABASE_URL` to the test branch. **Do not point this at a
   database with real data** — the suite truncates every table on
   each test (see below).

2. Apply the schema to the test database:

   ```bash
   npm run test:db:migrate
   ```

   This runs the same migrations as `db:migrate`, but against
   `.env.test` (`MIGRATE_ENV_FILE=.env.test`).

`tests/integration/setup.ts` provides the shared helpers:

- `testDb` — a drizzle client bound to the test database.
- `cleanDb()` — `TRUNCATE … RESTART IDENTITY CASCADE` over every
  table. Integration tests call it in `beforeEach` for a clean slate.
- `seedUser(overrides?)` — inserts a `users` row so foreign keys on
  `offerings.user_id` / `orders.user_id` resolve. Order- and
  offering-lifecycle tests seed rows directly rather than funding
  through Wapu.

Because every integration file truncates the shared database in
`beforeEach`, files **must not** run concurrently — two files would
wipe each other's rows mid-test. That is why
`fileParallelism: false` is set globally and re-passed by the
`test:integration` script. Tests within a single file already run
sequentially.

## Gated staging smoke tests

Two integration files exercise a real external wallet rail against a
live environment. Both are **gated**, so a default `npm test` needs no
external credentials:

- `tests/integration/lib/wapu-staging.test.ts` drives the real Wapu
  client against Wapu's staging environment. Wrapped in
  `describe.skipIf(!HAS_WAPU)`, where `HAS_WAPU` is true only when both
  `WAPU_API_KEY` and `WAPU_PAY_APU_HOST` are present in `.env.test`.
- `tests/integration/lib/nwc-staging.test.ts` drives a real NWC
  (NIP-47) wallet — `make_invoice` then `lookup_invoice` — to verify
  the sats-rail receive path. Wrapped in
  `describe.skipIf(!NWC_TEST_URI)`, so it runs only when `NWC_TEST_URI`
  is set in `.env.test`.

The Wapu gating reflects a deliberate architecture choice (ADR 0025):
there is **no mock Wapu client**. `getWapuClient()` always builds the
real client and throws when either env var is missing, so a
misconfigured deploy fails loud instead of silently faking payments.
The trade-off is that the live integrations are verified only by these
gated smoke tests; the rest of the suite seeds order rows directly
rather than funding through Wapu or NWC.

## Coverage

```bash
npm run test:coverage
```

`vitest.config.ts` reports `text` and `lcov`, scoped to
`app/api/**` and `lib/**` (components are excluded — there are no
component tests). The `lcov` report lands in `coverage/` for upload
to a coverage viewer. Coverage numbers are only meaningful on a full
run with the integration database configured — a `test:unit`-only run
will under-count the server and route code that the integration suite
drives.

## Writing a new test

- Put unit tests under `tests/unit/<mirror of source path>` and
  integration tests under `tests/integration/<mirror>`.
- Name files `*.test.ts`. The suite is backend/logic only; there are
  no React component tests (`*.test.tsx`) by design — UI behaviour is
  exercised manually via the [judge walkthrough](../testing-plan.md).
- If the test touches the database, the Wapu/Lightning clients, or
  any server-only module, add `// @vitest-environment node` at the
  top and seed rows with `seedUser` / direct inserts.
- Prefer asserting on stable, user-facing error codes (e.g.
  `slug_taken`, `price_below_wapu_minimum`) rather than on message
  prose, so copy changes do not break tests.
- For payment-path changes, add or update the relevant gated staging
  smoke test and note in the PR how you exercised it (per
  `CONTRIBUTING.md`).

## What the suite covers

- Pure validators and encoding: `lib/creator/ar-bank-id`,
  `lib/schemas/primitives`, `lib/explore-params`, `lib/orders-params`
  (filter/sort/pagination parsing, href building, order
  display-status), `lib/jsonld`, `lib/exchange-rate`, and the
  `lib/lightning` helpers.
- Auth primitives: `lib/auth` (session sign/verify), `lib/env`, the
  Nostr verify / http-auth / nip05 / create-account helpers, and
  `lib/creator/sign-settings-payload`.
- Content-Security-Policy (`lib/csp`): per-request nonce generation
  and the production/development CSP builder.
- Encryption at rest (`lib/crypto`): the AES-256-GCM round-trip used
  to store a seller's NWC connection URI.
- Blossom image uploads (`lib/blossom/client`): server-list parsing
  and the signed, any-ok multi-server upload.
- User-row helpers (`lib/creator/users`): `slugifyDisplayName`,
  `hasPayoutConfigured`, `expectedPriceCurrency` (the rule behind
  `price_currency_mismatch`), and `kind0RefreshPatch` (the
  placeholder refresh from kind:0); plus an integration test for
  locale seeding at sign-in (ADR 0021).
- Offerings data layer (integration): create / update / archive /
  list, slug uniqueness, and cross-tenant scoping in
  `lib/creator/offerings`.
- Create-course validation: `CreateOfferingSchema` /
  `UpdateOfferingSchema` — including the `https`-only `download_url`
  refinement, the `code_count` rule, and the redeem/contact link
  (`lib/creator/redeem-url`'s `isValidRedeemUrl`) — plus
  `normalizeTags`.
- Payout math: `quoteSellerPayout` fee/net computation, the number
  behind the `WAPU_MIN_NET_ARS` floor and the seller withdrawal.
- Wapu client (`lib/wapu`): transaction status helpers,
  deposit-credited detection, and the fail-loud `getWapuClient`
  factory.
- Wapu settlement (integration): both legs of the two-leg rail —
  `pollWapuDeposit` (deposit → paid → code draw → withdrawal) and
  `openSellerWithdrawal` / `pollWapuWithdrawal` — with the idempotency
  that keeps a re-polled deposit or a re-run cron from opening a second
  payout, exercised via the `_setWapuClientForTests` seam.
- NWC sats rail (`lib/nwc`): URI/relay validation, `mintNwcInvoice`,
  `lookupNwcInvoice`, and the settings-time `validateNwcConnection`
  probe; the live receive path is covered by the gated `nwc-staging`
  smoke test (ADR 0029).
- The settlement cron (`/api/cron/wapu-settlements`) `CRON_SECRET`
  gate and `runWapuSettlements` sweep behaviour.
- Recommendations (integration): `listRecommendedOfferings` ranking by
  tag overlap with a buyer's paid orders and by seller history.
- Order lifecycle and the order status-poll route (integration): the
  `direct_lightning` rail poll and the read-time expiry that flips an
  unpaid, expired order to failed, plus the download proxy route.

UI behaviour is exercised by the manual
[judge walkthrough](../testing-plan.md) rather than component tests —
the suite is backend/logic only.
