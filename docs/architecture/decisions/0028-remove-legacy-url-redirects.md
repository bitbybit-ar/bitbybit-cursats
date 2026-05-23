# 0028. Remove the legacy URL redirect layer

- **Date**: 2026-05-23
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-23

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-23 | — | Initial version. | Record the pre-launch removal of the `proxy.ts` 308-redirect layer. |

---

## Context

The pre-launch renames left `proxy.ts` carrying a three-generation
308-redirect layer that mapped every old URL to its current canonical
form:

- **pre-ADR-0014** `/panel/*` → `/my-courses`, `/orders`, `/settings`,
  `/create-course`.
- **ADR-0014 era** Spanish top-level slugs (`/mis-cursos`,
  `/mis-ventas`, `/mis-estudiantes`, `/configuracion`, `/onboarding`)
  → their English equivalents.
- **public routes** `/explorar`, `/iniciar-sesion`, `/gracias`,
  `/reclamar` → `/explore`, `/sign-in`, `/receipt`, `/claim`.

The layer exists to keep external bookmarks alive across a rename. But
Cursats has **not launched**: there are no production links to any of
those old URLs. ADR
[0023](0023-english-public-content-slugs.md) already acted on this for
the public-content rename, shipping it with no back-compat redirect.
The buyer/creator redirects were the only renames still carrying 308s
— for bookmarks that do not exist.

## Decision

Remove the legacy-redirect layer from `proxy.ts`: the `LEGACY_PATHS_RE`
matcher, the `rewriteLegacyPath` table, and the redirect branch in the
handler. `proxy.ts` keeps its two remaining responsibilities — gating
creator routes behind a session, and the next-intl locale rewrite. Old
URLs now 404 like any other unknown path.

The reserved-slug list in `lib/admin/ar-bank-id.ts` is **retained
unchanged**: it still blocks users from claiming slugs that collide
with current route names and with the now-dead legacy names, so a
seller cannot grab e.g. `/explorar` as a storefront slug. A unit test
already pins `panel` as reserved.

## Consequences

### Positive

- `proxy.ts` drops the redirect regex + rewrite table and one
  `RegExp.exec` per request; the routing surface is now exactly the
  `app/` tree, with nothing to reverse-engineer from middleware.

### Negative

- If a pre-launch bookmark or already-shared link to an old URL
  exists, it now 404s instead of redirecting. Judged negligible
  pre-launch.

### Neutral

- Re-introducing a redirect after launch, should a real need arise, is
  a small localized change in `proxy.ts`.

## Alternatives considered

- **Keep the redirects.** Rejected: they guard bookmarks that do not
  exist, and run on the hot path of every request.
- **Also drop the reserved legacy slugs.** Rejected: reserving the old
  names is cheap insurance against a seller claiming a confusing slug,
  and removing them would break the existing reserved-slug unit test
  for no gain.

## References

- ADR [0014](0014-marketplace-open-to-all-logged-in-users.md) (panel
  removal), [0017](0017-flatten-seller-urls.md) (seller URL
  flattening), and [0023](0023-english-public-content-slugs.md)
  (public-slug rename, already no redirect) — the renames that created
  the redirect layer. The renames stand; this ADR withdraws only the
  back-compat redirect.
- `proxy.ts` — the edge middleware the layer lived in.
- `docs/architecture/routing.md` — the route map; the historical
  mappings now live only in its Change Log.
