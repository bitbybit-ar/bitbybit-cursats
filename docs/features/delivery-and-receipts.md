# Delivery and receipts

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Receipt page, Download proxy | Documented the download access bounds: a paid download order may fetch the file up to five times within 30 days of payment, enforced by the proxy, with the receipt card surfacing the remaining count and expiry date. | The proxy now enforces a per-order fetch cap and a post-payment window (`lib/download-limits.ts`); the doc must describe that bound instead of stating downloads are unlimited and never expire. |
| 2026-05-23 | By design | Reframed the scope section (formerly "What we deliberately do not do") as "By design", leading each point with the strength (receipt-only delivery, secret-by-construction receipts, no email). | The "what we don't do" framing read as incompleteness, but each item is a deliberate design strength — the section should sell it, not apologize for it. |
| 2026-05-23 | Receipt page, Download proxy | Switched the Spanish "Descargar" label to "Download file" and reframed the proxy access model in present tense (what it does, not what is deferred). | Docs must match the English-only UI and read as a complete, shipped system. |
| 2026-05-22 | — | Removed the Nostr-DM channel and the outgoing-signing-identity section: delivery is now the in-app receipt page only. | The server-side Nostr signing key (`NOSTR_NSEC`) and DM code were removed; the receipt page was always the system of record. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — describe the two delivery channels, the status-gated download proxy, the optional Nostr DM, and the claim flow. |

---

## Table of Contents

1. [Delivery model](#delivery-model)
2. [The receipt page — always available](#the-receipt-page--always-available)
3. [The download proxy](#the-download-proxy)
4. [The claim flow](#the-claim-flow)
5. [By design](#by-design)

---

## Delivery model

Once an order flips to `paid`, the platform must hand the buyer
the thing they bought — a redemption code or a download URL.
Cursats does this through a single channel: an **in-app receipt
page** at `/[locale]/receipt/[orderId]`. It is always available,
regardless of whether the buyer is signed in or has a Nostr
identity; the opaque URL is the only access key.

There is no email channel and no Nostr DM channel — the receipt
page is the system of record. Decision in ADR
[0006-nostr-and-inapp-delivery](../architecture/decisions/0006-nostr-and-inapp-delivery.md).

## The receipt page — always available

Every paid order has a permanent page at
`/[locale]/receipt/[orderId]` where `orderId` is an opaque
identifier (≥128 bits of entropy, generated server-side on order
creation). The URL is the access token; knowing it is sufficient
to render the page. The page renders the same content regardless
of the requester's identity.

What renders depends on the offering type:

### For `code` offerings

- The redemption code (a short, human-friendly string the buyer
  shows to the seller).
- The offering title, seller display name, and the date paid.
- A "Copy code" button.
- A small note explaining how to redeem (the seller's
  instructions, if they configured any).

### For `download` offerings

- A "Download file" button pointing at the download proxy,
  `/api/downloads/[orderId]`.
- The offering title, seller display name, and the date paid.
- A line showing how many downloads remain and the date the link
  stays available; once the allowance is spent, a note that the
  link is no longer active.

Both versions also surface the order's basic details (rail,
amount in sats and ARS) and a "Connect a Nostr identity to also
get this in your Nostr client" CTA if the buyer paid anonymously.

Viewing the receipt works forever — the page itself never expires.
For `download` offerings the *file download* is additionally bound
to a window and a fetch cap; see
[The download proxy](#the-download-proxy).

## The download proxy

A `download` offering's underlying file lives at the seller's
`offerings.download_url` (uploaded by the seller; not Blossom —
Blossom is for public images). The receipt page never links that
URL directly. Instead it links the **download proxy** at
`/api/downloads/[orderId]` (`app/api/downloads/[orderId]/route.ts`),
which streams the file after enforcing access checks.

What the proxy does:

1. Resolves the order by the opaque `orderId` (≥128 bits of
   entropy — the URL is the access key; no session required, so
   an anonymous buyer can redeem from any device with the receipt
   link).
2. Refuses with **403** if the order's status is not `paid`
   (i.e. `pending`, `failed`, or `refunded`).
3. Refuses with **404** if the offering is missing, archived, or
   not a `download` type. The 404 (rather than 422) on
   wrong-type deliberately avoids revealing whether an order id
   exists for the wrong offering type.
4. Refuses with **410** once the buyer has spent their download
   allowance — either the post-payment window has elapsed
   (`link_expired`) or the per-order fetch cap has been reached
   (`download_limit_reached`). The download counter is bumped
   atomically and only after every other check passes, so a
   refused request never consumes one of the buyer's downloads.
5. Otherwise streams the file, keeping the seller's source URL
   out of the public DOM.

Access is scoped so that a paid order grants a bounded, predictable
right to the file (both values live in `lib/download-limits.ts`):

- **The link is live for 30 days after payment**
  (`DOWNLOAD_ACCESS_WINDOW_DAYS`). That covers a buyer who comes
  back for a method book a few weeks later, while stopping a shared
  receipt link from being useful indefinitely.
- **A paid order may fetch the file up to five times**
  (`MAX_DOWNLOADS_PER_ORDER`). Enough to re-download across devices
  or recover a lost file, capped so one purchase is not an open
  mirror.

The receipt page's download card shows how many downloads remain
and the date the link expires; once the allowance is spent, it
explains the link is no longer active. The receipt page itself
stays available at its `orderId` URL — the bounds above apply to
the file download, not to viewing the receipt.

## The claim flow

A buyer who paid anonymously and *later* wants their order to
land in their persistent `/purchases` history can sign in and
visit `/claim/[orderId]`, pasting (or already holding via the URL
itself) the order ID they want to claim.

Behind the scenes:

1. The signed-in user must hold a valid session.
2. They submit the `orderId` (via the URL itself if they followed
   a claim link; otherwise via a small paste-and-claim form).
3. The server verifies the order exists and is not yet attached
   to a pubkey.
4. If both, the server attaches the session's pubkey to the
   order, and the order shows up in that user's `/purchases`.

The order's *contents* (code, download URL) are unchanged — claim
is a metadata operation, not a fresh delivery. It exists so an
anonymous buyer can retroactively get the history-keeping benefit
of Tier 3 without needing to have decided up front.

A second claim attempt against an already-claimed order is a
no-op for matching pubkeys and a 409 Conflict for mismatched
ones.

## By design

- **No email, anywhere.** No email field at checkout, no
  email-sender provider, no inbox-deliverability concerns.
- **Receipt-only delivery.** The receipt page is the single
  delivery channel — there is no server-side signing key and no
  Nostr-DM push.
- **The buyer holds the only key.** A seller cannot regenerate or
  resend a buyer's receipt URL or code from `/orders`: the buyer
  already holds the permanent URL, and the seller never had it.
- **The URL is the identity.** The storefront URL is the
  canonical seller identity; an unverified "verified seller"
  badge would be more confusing than helpful, so there isn't one.
- **Receipts are secret by construction.** Receipt URLs are
  unguessable; the buyer can copy and share their own URL, but
  the UI never invites a public broadcast.
