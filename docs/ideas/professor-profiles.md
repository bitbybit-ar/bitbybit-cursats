# Professor profile pages

> **Status:** Draft
> **Last updated:** 2026-05-08

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-08 | — | Initial version. | Capture the idea for richer per-merchant profile pages so the merchant avatar in the marketplace grid has somewhere meaningful to land. |

---

## The idea

Today the merchant slug at `/[locale]/m/[slug]` renders a
storefront: hero (display name + bio + avatar) plus a grid of
the merchant's offerings. The marketplace grid has been
extended (this branch) so the avatar in each card links to that
slug.

The next iteration borrows arena's profile-header pattern but
swaps in education content:

- **Header.** Avatar, display name, bio, and a customizable row
  of up to **5 badge circles** that the merchant picks from
  their settings page. Badges might be:
  - "100 sats classes published"
  - "Verified by La Crypta"
  - "Early adopter (Hackathon #3)"
  - "Lightning power-seller"
  - "Multi-language teacher"
- **Body.** A grid of the merchant's offerings (in place of
  arena's badge grid). Same `OfferingCard` component the
  marketplace and landing use, with `hideMerchant` set since
  we're already on the merchant's page.
- **Optional sections.** Reviews / testimonials (Nostr
  kind:1 mentions filtered by `t` tag), upcoming live
  sessions, recent activity feed.

## Why this matters

The avatar-on-card pattern only makes sense if the destination
is interesting. A bare storefront grid is what we have today;
the badge row + bio depth is what makes a profile feel like a
person, not a shop.

## Implementation notes

- Badge customization lives under `/[locale]/panel/configuracion`,
  next to the existing CBU/alias settings. Storage: a new
  `merchant_badges` table or a JSON column on `merchants` (the
  table exists, see `lib/db/schema.ts`). Cap enforced at the
  schema level (`array_length <= 5`).
- The 5-badge cap is intentional. Arena ships with that limit
  on its profile header for the same reason: the row reads as
  curated, not exhaustive, and the user has to make a real
  choice about which five matter.
- Badge eligibility rules (which badges a merchant *can* pick)
  live in `lib/creator/badges.ts` once it exists; v1 might just
  be a hardcoded list with manual issue-and-revoke from the
  platform admin surface.
- The header design should not use the polaroid pattern from
  the landing. That's reserved for the landing's "feel" — the
  profile page wants a more app-like feel.

## Why this is "later"

We have a single-page storefront that works. The profile
extension is a polish pass that becomes valuable once we have
multiple merchants whose differences matter to buyers — at
zero or one merchant, it's just decoration.
