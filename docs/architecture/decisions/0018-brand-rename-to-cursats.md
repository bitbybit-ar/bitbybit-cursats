# 0018. Brand rename to Cursats

- **Date**: 2026-05-12
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-10-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-10-22 | Decision, Consequences | Dropped the pre-rename host name; the site has one host, `cursats.bitbybit.com.ar`. | The old host was never meant to be live and is being removed from the deployment, so the repo no longer names it. |
| 2026-05-12 | — | Initial version. | Record the brand rename from "Cursá" to "Cursats" so future contributors find the etymology, scope, and out-of-scope items in one place. |

---

## Context

The project was originally named **Cursá** — the Argentine voseo
imperative of *cursar* ("go take a course"). The tagline that grew up
around it ("Cursá tu próxima clase con sats") fused the verb with the
unit the platform settles in. The wordmark itself never made that
connection — a buyer arriving cold could read "Cursá" as a generic
education brand with no signal that Lightning, sats, or Bitcoin were
the point.

Two pressures pushed for a rename:

1. **Discoverability.** The marketplace is pre-launch and bitcoin-
   curious educators are a top funnel. A wordmark that *names* sats
   does more work than one that hides them behind a tagline.
2. **Internationalization.** "Cursá" carries an accent that
   non-Spanish readers can't pronounce and that several tooling
   surfaces (URLs, shell paths, package names) had to strip anyway.
   The pre-rename `docs/about/mission.md` already split the wordmark
   into "Cursá" (UI) and `cursa` (slug); two surfaces of one name was
   a cost we paid every time someone joined the project.

The project has no production users, no signed Nostr events on
relays, and no NPM publications, so a rename today carries almost no
breakage cost — a future rename would.

## Decision

Rename the product from **Cursá** to **Cursats** — a portmanteau of
*cursá* (the voseo verb, still used in body copy) and *sats* (the
unit the platform settles in). The wordmark is "Cursats" — single
token, no accent, identical in product copy, repo names, domains, and
shell paths.

The scope of this rename covers, in this PR:

- **Brand strings** in `lib/site.ts`, `app/manifest.ts`,
  `app/[locale]/opengraph-image.tsx`, `app/[locale]/layout.tsx`
  (JSON-LD), the navbar/footer wordmark, `messages/{es,en}.json`,
  `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, every doc under
  `docs/`, and every ADR that mentioned the project by name.
- **Domain references** in code and docs: the site's one host is
  `cursats.bitbybit.com.ar`. The DNS record itself is provisioned
  outside the repo.
- **GitHub repo references** in code and docs:
  `bitbybit-ar/bitbybit-cursa` → `bitbybit-ar/bitbybit-cursats`. The
  repo rename itself is a GitHub org-settings action; GitHub
  301-redirects the old URL automatically once renamed.
- **Package name** in `package.json`: `bitbybit-cursa` →
  `bitbybit-cursats`.
- **Test hostnames**: `cursa.test` → `cursats.test` in vitest
  fixtures (`tests/integration/api/*`, `tests/unit/lib/*`).
- **Internal identifiers**:
  - Nostr tag namespace on signed events: `cursa_action` →
    `cursats_action` (NIP-98 settings PATCH), `cursa_signer` →
    `cursats_signer` and `cursa_locale` → `cursats_locale` (auth
    event). The tag names are part of the signed envelope; renaming
    them is safe because no production event has been signed.
  - `localStorage` keys: `cursa-nip46-client-key` →
    `cursats-nip46-client-key` (NIP-46 client pairing) and the
    `cursa:nostr:profile:` prefix → `cursats:nostr:profile:` in
    `lib/hooks/useNostrProfile.ts`.
  - LNURL probe memo: `"cursa-probe"` → `"cursats-probe"` in the
    settings PATCH LUD-21 probe (`app/api/settings/route.ts`).

The Spanish verb **"Cursá"** survives in product voice — the
landing tagline "Cursá tu próxima clase con sats", the hero copy,
and the FAQ title all keep the imperative. The rule is in
`CLAUDE.md`'s code-rules section and in `docs/about/mission.md`'s
"A note on the name" section: *brand noun → Cursats; voseo verb →
Cursá*.

## Out of scope

- **The Postgres database name** `bitbybit_cursa` (in
  `.env.example` and `.env.test.example`). Renaming the DB requires
  a migration we don't need, and the DB name is invisible to anyone
  but operators.
- **The local working-directory** (`~/Documents/projects/.../bitbybit-cursa`).
  Filesystem renames are an operator concern and not coupled to the
  repo state.
- **Vercel project rename**. Handled in the Vercel dashboard, not
  via code.

## Consequences

### Positive

- The wordmark now surfaces the positioning ("settle in sats") that
  the body copy was already making. Cold visitors get the pitch from
  the logo alone.
- One spelling for product, repo, domain, and shell — the
  pre-rename "two surfaces of one name" split goes away.
- Argentine readers still get the voseo joke, just relocated from
  the wordmark into the tagline.

### Negative

- Anyone with a clone of the repo will need to update their git
  remote URL after the GitHub rename. GitHub redirects HTTPS URLs
  for ~90 days; SSH URLs need a manual `git remote set-url`.

### Neutral

- The etymology paragraph in `docs/about/mission.md` is rewritten
  in the same change. This ADR is the canonical record; the mission
  paragraph is its summary in product voice.

## Alternatives considered

- **Keep "Cursá" and lean harder on the tagline.** Rejected: the
  tagline already does that work, and the cost of carrying an
  accented wordmark through two surfaces (slug vs. brand) didn't
  shrink with use — it grew.
- **Rename to a fully new wordmark unrelated to "Cursá"** (e.g.
  "Bitclase", "Satclass"). Rejected: throws away the
  Spanish-speaking audience's recognition of the verb form, which
  is the strongest hook for the educator vertical we target in ADR
  0003.
- **Rename later, after launch.** Rejected: every signed Nostr
  event, every external bookmark, every cached search result that
  accumulates post-launch raises the cost of a rename. The cheapest
  moment to do this is exactly now.

## References

- `docs/about/mission.md` § "A note on the name" — the etymology
  in product voice.
- `CLAUDE.md` § "Code rules (enforced)" — the brand-noun-vs-verb
  rule that governs UI strings.
- Plan file:
  `~/.claude-personal/plans/reflective-popping-stream.md`.
