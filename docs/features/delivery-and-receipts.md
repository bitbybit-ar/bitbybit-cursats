# Delivery and receipts

> **Status:** Active
> **Last updated:** 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | — | Removed the Nostr-DM channel and the outgoing-signing-identity section: delivery is now the in-app receipt page only. | The server-side Nostr signing key (`NOSTR_NSEC`) and DM code were removed; the receipt page was always the system of record. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — describe the two delivery channels, the status-gated download proxy, the optional Nostr DM, and the claim flow. |

---

## Table of Contents

1. [Delivery model](#delivery-model)
2. [The receipt page — always available](#the-receipt-page--always-available)
3. [The download proxy](#the-download-proxy)
4. [The claim flow](#the-claim-flow)
5. [What we deliberately do not do](#what-we-deliberately-do-not-do)

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

- A "Descargar" button pointing at the download proxy,
  `/api/downloads/[orderId]`.
- The offering title, seller display name, and the date paid.
- A small note explaining the file is available from the receipt
  page.

Both versions also surface the order's basic details (rail,
amount in sats and ARS) and a "Connect a Nostr identity to also
get this in your Nostr client" CTA if the buyer paid anonymously.

The receipt URL works forever. There is no "your receipt expired"
failure mode.

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
4. Otherwise streams the file, keeping the seller's source URL
   out of the public DOM.

What the proxy does **not** do yet — both named in ADR 0006 as
future hardening, not wired in v1:

- **Per-order expiry** (e.g. dead 24h after `paid_at`). Today the
  link works as long as the order is `paid`.
- **Single-use semantics** (a download-count limit). Today there
  is no per-order download cap.

The receipt URL (`orderId`) is the persistent access key for both
the receipt page and the proxy.

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

## What we deliberately do not do

- **No email.** Period. No email field at checkout, no
  email-sender provider, no inbox-deliverability concerns.
- **No Nostr DM channel.** Delivery is the receipt page only;
  there is no server-side signing key and no DM push.
- **No resend-from-the-seller UI.** A seller cannot regenerate or
  resend a buyer's receipt URL or code from `/orders`. The buyer
  already has the URL; the seller never had it. Deferred to v1.1.
- **No "click to verify the seller's identity" badge.** The
  storefront's URL is the canonical identity; an unverified
  visual badge is more confusing than helpful.
- **No "share this receipt" social button.** Receipt URLs are
  secret-by-construction. The buyer can copy the URL if they
  want to share it; we do not invite them to.
