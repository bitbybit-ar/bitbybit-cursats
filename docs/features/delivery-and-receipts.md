# Delivery and receipts

> **Status:** Active
> **Last updated:** 2026-05-21

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — describe the two delivery channels, the status-gated download proxy, the optional Nostr DM, and the claim flow. |

---

## Table of Contents

1. [Two delivery channels](#two-delivery-channels)
2. [The receipt page — always available](#the-receipt-page--always-available)
3. [The download proxy](#the-download-proxy)
4. [Optional Nostr DMs](#optional-nostr-dms)
5. [Cursats's outgoing signing identity](#cursatss-outgoing-signing-identity)
6. [The claim flow](#the-claim-flow)
7. [What we deliberately do not do](#what-we-deliberately-do-not-do)

---

## Two delivery channels

Once an order flips to `paid`, the platform must hand the buyer
the thing they bought — a redemption code or a download URL.
Cursats does this through two channels:

1. **An in-app receipt page** at `/[locale]/receipt/[orderId]`.
   Always available, regardless of whether the buyer is signed
   in or even has a Nostr identity. The opaque URL is the only
   access key.
2. **An optional encrypted Nostr DM** delivered to the buyer's
   pubkey, only if the buyer connected one at checkout or was
   already signed in.

The receipt page is the **canonical** channel — the system of
record. The Nostr DM is a **push** channel that mirrors the same
content; if the DM never arrives (relays down, recipient never
opens their client), the receipt page is still there.

There is no email channel. Decision in ADR
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

## Optional Nostr DMs

When the order's rail confirms payment (Wapu webhook or LUD-21
verify settle), and **if** the order has a buyer pubkey attached,
the server sends an encrypted Nostr DM to that pubkey carrying
the same receipt URL.

How the buyer pubkey gets attached:

- **At checkout (Tier 2 — anonymous + identifier).** The buyer
  paste an `npub1…` or NIP-05 (`name@domain.com`) into the
  checkout form before paying. The server resolves NIP-05 via
  `/api/nip05/resolve` and stores the resolved pubkey on the
  order row.
- **From the session (Tier 3 — signed-in).** A signed-in buyer's
  pubkey is taken from the session at order creation; no extra
  step.

The DM is **NIP-44 encrypted** to the buyer's pubkey (`@noble`'s
secp256k1 + the spec's HKDF + ChaCha20). The body is plain text
containing the receipt URL and a short summary line; everything
else (the code, the download URL) is *not* in the DM — the buyer
has to click through to the receipt page to get it. This means a
leaked DM does not by itself leak the redemption code; the
attacker would also need to compromise the URL (which sits
behind opacity, not a key).

Relay delivery is **best-effort**. Cursats publishes to a small
set of public relays and the seller's preferred relays (if any
are configured); a DM that does not arrive for any reason is
recoverable via the receipt URL the buyer already has.

## Cursats's outgoing signing identity

The deployment signs outgoing DMs with a server-side Nostr key
held in `NOSTR_NSEC` (env var, never reaches the client). The
corresponding npub is the public identity of the deployment.

Key rotation is bounded. Rotating `NOSTR_NSEC` does not invalidate
any past receipts — the receipt page is what the buyer relies
on; the DM is just an additional push. After rotation, future
DMs go out from the new npub; the buyer's client picks them up
the same way (the DM is encrypted *to* the buyer's pubkey, not
*from* a specific signing identity the buyer must trust).

The platform's npub appears on the landing footer and in the
`Organization` JSON-LD so a Nostr-aware buyer can verify the
deployment they paid is the deployment they think they paid.

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
- **No code/URL in the Nostr DM body.** The DM carries the
  receipt URL only; the code or download URL must come from a
  fresh receipt-page render. Two reasons: (a) one round-trip
  through TLS to load the page is no worse than a DM round-trip
  for the buyer, and (b) a leaked DM does not directly leak the
  redemption value.
- **No resend-from-the-seller UI.** A seller cannot regenerate or
  resend a buyer's receipt URL or code from `/orders`. The buyer
  already has the URL; the seller never had it. Deferred to v1.1.
- **No "click to verify the seller's identity" badge.** The
  storefront's URL is the canonical identity; an unverified
  visual badge is more confusing than helpful.
- **No "share this receipt" social button.** Receipt URLs are
  secret-by-construction. The buyer can copy the URL if they
  want to share it; we do not invite them to.
