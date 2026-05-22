# Offerings catalog

> **Status:** Active
> **Last updated:** 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Lifecycle | Replaced the "Wapu webhook handler / Nostr DM sender" aside with the poll-driven equivalents (Wapu deposit poller, settlement cron). | Webhooks and the server Nostr-DM channel were removed as dead code. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — describe the two product primitives, the URL shape, pricing currency picker, Blossom image upload, tags, and the lifecycle. |

---

## Table of Contents

1. [Two primitives](#two-primitives)
2. [URL shape](#url-shape)
3. [Pricing — the currency picker](#pricing--the-currency-picker)
4. [Images via Blossom](#images-via-blossom)
5. [Tags](#tags)
6. [Lifecycle — active vs archived](#lifecycle--active-vs-archived)
7. [Mutation surface](#mutation-surface)
8. [What we deliberately do not do](#what-we-deliberately-do-not-do)

---

## Two primitives

Every offering is exactly one of two types — picked at creation
time, immutable thereafter:

### `code` — redeemable in person

The buyer pays, lands on the receipt page, and sees a
**redemption code** they show to the seller in person at the
next class. Used for:

- Single class — "Una clase de piano de 60 minutos."
- Lesson packs — "Bono de 4 clases de tango."
- Monthly bonos — "Un mes de clases ilimitadas."

Codes come from a **pre-minted pool**, not generated on the fly.
The seller mints a batch of codes into `offerings.code_pool`
(an array column) via the **Mint codes** action; when an order
confirms, `drawAndAssignCode` (`lib/orders.ts`) pops one code
from the pool and writes it to `orders.redemption_code`. A second
buyer gets the *next* code from the pool, so every paid order
carries a distinct code.

A `code` offering is **sold out when its pool is empty.**
Checkout is refused before payment if the pool has no codes left
(so a buyer is never charged for a code that cannot be
delivered); the seller re-opens the offering by minting more
codes. There is a narrow race where two buyers check out the
last code at once — the loser lands on a "code pending" receipt
state rather than being double-charged. The seller's redemption
UI (mark-as-used) is deferred to v1.1; in v1 the seller reads
the code off the buyer's phone and crosses it off their notebook.

### `download` — digital file

The buyer pays, lands on the receipt page, and sees a
**Descargar** button pointing at a download proxy
(`/api/downloads/[orderId]`) that streams the private file the
seller uploaded to `offerings.download_url`. Used for:

- PDF method books
- Sheet music
- Recorded courses, audio packs

The proxy keeps the seller's source URL out of the public DOM
and gates access on the order's status (it 403s an unpaid order
and 404s a wrong-type or archived offering). Per-order expiry
and single-use are named in ADR 0006 as future hardening — not
yet wired in v1. See
[delivery-and-receipts](./delivery-and-receipts.md) for the
proxy's access model.

Both primitives share the same checkout, payment, confirmation,
and notification surface. The receipt page is the only place
where the primitive shows up at all — it picks `code` rendering
vs `download` rendering on the type column. The Wapu deposit
poller, the LUD-21 poller, the settlement cron — none of them
care which primitive an order is for.

## URL shape

Every offering lives at a stable, human-readable URL:

```text
/<userSlug>/c/<offeringSlug>
```

For example, the piano teacher with slug `pianoba` selling a
"Clase de piano de una hora" gets:

```text
cursats.bitbybit.com.ar/pianoba/c/clase-piano-1h
```

The `c/` segment is reserved (along with a small set of other
top-level route names like `explore`, `settings`,
`my-courses` — full list in
`lib/admin/ar-bank-id.ts`); it cannot be claimed as a user
slug. This is what lets storefronts live at `/<userSlug>`
without colliding with any product slug.

Both `userSlug` and `offeringSlug` are kebab-case identifiers
chosen by the seller. ADR
[0017](../architecture/decisions/0017-flatten-seller-urls.md)
dropped the prior `/m/` prefix; ADR
[0023](../architecture/decisions/0023-english-public-content-slugs.md)
pinned the convention to English slugs for the reserved tokens.

## Pricing — the currency picker

The seller picks the price in **either** sats **or** ARS at
creation time, and the storefront converts on display using the
Yadio rate. Both forms are stored — the field they entered is
the source of truth, the other is recomputed live so the buyer
always sees a fresh sats↔ARS pair regardless of which side moves.

Why both. A piano teacher pricing "$15.000 ARS" sees a fluid sats
equivalent that drifts with the BTC↔ARS rate; she does not have
to re-publish the offering every time bitcoin moves. A
sats-native tutor pricing "5000 sats" sees an ARS sticker that
his pesos-thinking students can read. Neither side is forced
into the other's unit.

The rate seam is `lib/exchange-rate.ts:getSatsPerArs()`; the
storefront calls it once per page render and presents both
prices.

Decision in ADR
[0019](../architecture/decisions/0019-pricing-currency-picker.md).
The live-rate plumbing is ADR
[0022](../architecture/decisions/0022-live-exchange-rate-via-yadio.md).

## Images via Blossom

Offering images (and seller avatars) live on **Blossom** —
BUD-01/02, content-addressed storage on a Nostr-native server.
The upload path is browser-direct: the client hashes the file,
signs a short-lived `kind:24242` Blossom auth event, and `PUT`s
the file straight to the Blossom server. No image bytes ever go
through Cursats.

Why. Two reasons:

1. **No server-side image plumbing.** No multipart parsing, no
   antivirus scanning, no S3 credentials in env, no Vercel egress
   bill on image reads.
2. **Content-addressed.** The image URL contains the sha256, so
   it cannot be silently substituted by either the storage
   server or the platform.

The Blossom server list is configured via
`NEXT_PUBLIC_BLOSSOM_SERVERS` (comma-separated) and includes a
public default. Sellers who want their own server can fork the
deployment and replace the env var.

Decision in ADR
[0011](../architecture/decisions/0011-image-storage-via-blossom.md).

## Tags

Sellers attach free-form tags to each offering — `piano`,
`tango`, `intermediate`, `bonos`, `online`, etc. Tags are
lower-cased, deduped server-side, and limited to a small per-row
count. They serve two purposes:

1. **Discovery in `/explore`.** Buyers can filter by tag chips on
   the catalog page; the storefront URL accepts a `?tag=` query
   param for shareable links.
2. **Nostr interoperability (future).** Tags are a thin layer
   over what would be `t` tags on any future Nostr-native
   publication of offerings. Keeping them as a structured field
   now means a future migration is a re-shape, not a re-design.

Decision in ADR
[0024](../architecture/decisions/0024-offering-tags.md).

## Lifecycle — active vs archived

There is no draft/published state machine. An offering is **live
the moment it's created** (no separate Publish step). It has two
effective states, tracked by an `archived_at` timestamp:

| State | `archived_at` | Visible at `/explore` + storefront? | Buyable? |
|---|---|---|---|
| Active | `null` | Yes | Yes — once the seller's payout rail is configured (and, for `code` offerings, the pool is non-empty) |
| Archived | set | No | No (existing orders preserved) |

Notes:

- **Buyability is a checkout-time guard, not a publish gate.** A
  freshly created offering is visible immediately, but
  `createOrder` refuses checkout if the seller has not filled in
  the destination fields for their payout rail, or — for a `code`
  offering — if the code pool is empty. So a half-configured
  offering can be browsed but not bought, rather than being
  hidden.
- **Archiving** (the **Archive** button →
  `DELETE /api/my-courses/[id]`) sets `archived_at`. The offering
  disappears from public surfaces; existing orders keep rendering
  (the buyer's receipt page still works), but no new orders can
  be created against it.
- **Soft delete** is the canonical posture — a separate
  `deleted_at` column supports it; nothing is ever hard-deleted
  from `offerings`, because orders reference offering rows.

Decision in ADR
[0021](../architecture/decisions/0021-settings-preferences-and-soft-delete.md).

## Mutation surface

| Route | Action |
|---|---|
| `/[locale]/my-courses` | List all owned offerings (active + archived), archive button |
| `/[locale]/create-course` | Create a new offering |
| `/[locale]/my-courses/[slug]/edit` | Edit, mint codes, archive |
| `/[locale]/<userSlug>` | Public storefront — active offerings only |
| `/[locale]/<userSlug>/c/<offeringSlug>` | Public offering detail + buy CTA |

API surface:

| Endpoint | Purpose |
|---|---|
| `POST /api/my-courses` | Create offering |
| `PATCH /api/my-courses/[id]` | Edit (any field except type) |
| `DELETE /api/my-courses/[id]` | Archive (sets `archived_at`) |
| `POST /api/my-courses/[id]/mint-codes` | Append codes to a `code` offering's pool |
| `GET /api/my-courses/[id]/codes` | List the offering's codes |

Code minting is a **separate endpoint** from the edit PATCH on
purpose: it's a distinct audit action, and isolating it stops an
accidental field edit from piggybacking a code mint. Every
mutation writes a row to `admin_audit_log` (timestamp, actor
pubkey, route, payload diff). Read-only forever — there is no UI
to delete rows.

## What we deliberately do not do

- **No stock counts for downloads.** A `download` offering can be
  sold any number of times. `code` offerings are the one
  exception: they are bounded by their minted pool and sell out
  when it empties (mint more to re-open). There are still no
  variant- or SKU-style inventory counts.
- **No variants.** "Clase de 30 min" and "Clase de 60 min" are
  two offerings, not two variants of one.
- **No shipping.** Codes are redeemed in person; downloads are
  delivered via the receipt URL. There is nothing to ship.
- **No tax-by-destination.** Pricing is a single field; tax (if
  applicable) is the seller's responsibility offline.
- **No bundles.** A seller who wants to sell "course + workbook"
  bundles together creates a single offering that delivers
  both — typically as a `download` linking a single PDF that
  contains everything.
- **No scheduling / calendar.** Cursats sells *codes*, not slots.
  The seller's existing booking flow (WhatsApp, calendar, in
  person) is unchanged.

Decision rationale for this scope in ADR
[0003-educator-vertical](../architecture/decisions/0003-educator-vertical.md).
