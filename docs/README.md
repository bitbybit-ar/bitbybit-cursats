# Documentation

> **Status:** Active
> **Last updated:** 2026-05-23

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-23 | Structure, What to write in each doc | Added `architecture/automated-tests.md` to the structure tree and the doc table. | A new doc describing the automated vitest suite was added; the structural index must list it. |
| 2026-05-23 | Structure | Pruned the structure tree: removed the retired judge front-door doc (deleted from the repo; its submission framing now lives in `SUBMISSION.md`). | The structure index must not list a doc that no longer exists. |
| 2026-05-21 | Structure, What to write in each doc | Added the ordered `testing-plan.md` walkthrough and the new `features/` subfolder with the eight per-feature deep dives. Updated the "What to write in each doc" table accordingly. | Hackathon documentation pass — the docs tree gained a feature-doc layer that did not previously exist; the structural index needed to reflect it so contributors can find the new files. |
| 2026-05-12 | What this folder is, Structure | Rebranded "BitByBit Cursá" to "BitByBit Cursats" throughout. | Brand rename per ADR 0018 — portmanteau of *cursá* (the voseo verb) and *sats*. |
| 2026-05-05 | — | Initial version. | Bootstrap the docs tree using the canonical template from the `home` repo. |

---

## What this folder is

Internal documentation for Cursats — the project, its
architecture, and the decisions behind it.

## Structure

```
docs/
├── README.md                 ← you are here
├── _template.md              ← copy this for new docs
├── testing-plan.md           ← ordered numbered judge walkthrough
├── about/
│   └── mission.md            ← what Cursats is, who it's for, why
├── architecture/
│   ├── overview.md           ← system shape + key invariants
│   ├── routing.md            ← full route map
│   ├── automated-tests.md    ← vitest unit + integration suite
│   └── decisions/            ← Architecture Decision Records (ADRs)
│       ├── 0001-record-architecture-decisions.md
│       ├── …                 ← NNNN-*.md per decision
│       └── template.md       ← copy this for new ADRs
└── features/                 ← per-feature deep dives
    ├── checkout-flow.md
    ├── settlement-rails.md
    ├── nostr-identity.md
    ├── authentication.md
    ├── offerings-catalog.md
    ├── delivery-and-receipts.md
    ├── notifications.md
    ├── settings-and-payouts.md
    └── discovery.md
```

`SUBMISSION.md` (judge quickstart) lives at the **repo root**
next to `README.md`, not under `docs/`, so a judge cloning the
repo finds it without traversal.

`CHANGELOG.md` (project release log) and `CONTRIBUTING.md`
(contribution + vulnerability disclosure) live at the **repo root**,
not here. Per-doc edits are recorded inside each doc.

## Doc standard

Every file in this folder carries an inline header. The full standard
is in `CLAUDE.md` at the repo root; the short version:

1. Title (`# ...`).
2. Quoted block with `**Status:**` and `**Last updated:**` (ISO date).
3. `---` separator.
4. `## Change Log` table — newest row at the top, columns
   `Date | Section | Change | Reason`.
5. `---` separator.
6. `## Table of Contents` — only when the doc has 5+ sections or is
   longer than ~150 lines.
7. Body.

Specialized templates (ADRs, runbooks) keep their own additional
header fields but still carry an inline `## Change Log`.

## Doc style

- **Sentence case** for headings.
- **Second person** ("you run") in guides and runbooks.
- **Imperative mood** for runbook steps.
- **Descriptive link text** — never "click here".
- **No emoji** unless explicitly requested.
- **Code blocks always tagged** with the language.
- **Date format**: ISO 8601 (`YYYY-MM-DD`).
- **Hard wrap** Markdown at ~80 columns.

## What to write in each doc

| File | Purpose |
|---|---|
| Root `README.md` | Project pitch, origin story, top-level pointers |
| Root `SUBMISSION.md` | Judge quickstart — clone → env → run → buy |
| Root `CHANGELOG.md` | Every product-level change, grouped by release |
| Root `CONTRIBUTING.md` | How to contribute + vulnerability disclosure |
| `testing-plan.md` | Ordered numbered walkthrough for evaluators |
| `about/mission.md` | What the project is, who it's for, why it exists |
| `architecture/overview.md` | System shape + key invariants |
| `architecture/routing.md` | Full route map (buyer, account, creator, API) |
| `architecture/automated-tests.md` | Automated test suite — structure, how to run, what it covers |
| `architecture/decisions/NNNN-*.md` | One decision per file, frozen once accepted |
| `features/*.md` | Per-feature deep dives — design, code pointers, mermaid sequence diagrams |

When in doubt, ask: "If I joined this project tomorrow, which file
would hold this answer?" Put it there.
