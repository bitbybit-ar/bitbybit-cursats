# Authentication

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | — | Initial version. Split out of `nostr-identity.md`: the sign-in surface, the mobile `nostrconnect://` deep link, the session shape, and the payment-destination re-sign discipline now live here. Expanded the sign-in surface to spell out the NIP-46 attach modes, and added the previously-undocumented mobile flow from ADR 0025. | `nostr-identity.md` was carrying two concerns at once — *who you are on Nostr* (profile) and *how you log in* (signers/sessions). The login half deserves its own doc, and the mobile deep-link flow was only in an ADR. |

---

## Table of Contents

1. [One contract, several signers](#one-contract-several-signers)
2. [Sign-in surface](#sign-in-surface)
3. [Mobile sign-in — the `nostrconnect://` deep link](#mobile-sign-in--the-nostrconnect-deep-link)
4. [Session shape](#session-shape)
5. [Re-sign on payment-destination fields](#re-sign-on-payment-destination-fields)
6. [What we do not do](#what-we-do-not-do)

---

## One contract, several signers

Cursats has no passwords, no email, and no account form. The only
way to sign in is to prove control of a Nostr keypair, and every
signer path converges on the **same server contract**: a NIP-98
auth event posted to `POST /api/auth/nostr`. The server validates
the signature and the event's `created_at` freshness, materialises
(or finds) the user row — see
[lazy user-row materialisation](./nostr-identity.md#lazy-user-row-materialisation)
in the identity doc — mints a session JWT, and sets it as an
httpOnly cookie.

Because the server only ever sees a signed event, it cannot tell a
browser-extension login from a remote-signer login from a mobile
deep-link login. The differences below are all client-side
ergonomics over one contract.

Decision in ADR
[0007-optional-nostr-buyer-login](../architecture/decisions/0007-optional-nostr-buyer-login.md).

## Sign-in surface

`/sign-in` offers three signer choices:

1. **NIP-07 browser extension** — Alby, nos2x, Flamingo, etc. The
   extension signs the auth event without exposing the private key
   to the page. On mobile browsers no extension exists, so this
   button hides itself when `window.nostr` is absent (and another
   method is available).
2. **Pasted `nsec1…`** — for evaluators or users who do not yet
   have a signer set up. The key is held in memory for the lifetime
   of the tab and is never persisted to disk or sent to the server.
   (Convenient for the (AI) judge path; see
   [`testing-plan.md`](../testing-plan.md).) It is also the *least*
   safe path — it is the only one that puts the raw secret into the
   web page — so the UI nudges users toward a remote signer instead.
3. **NIP-46 remote signer** — the key stays on the user's phone or
   remote daemon (Amber, nsec.app, Primal, …); the browser sends an
   unsigned event and gets a signed event back over a Nostr relay.
   There are two ways to attach the signer:
   - **`nostrconnect://`** — Cursats mints a connect URI and opens a
     relay rendezvous the moment the panel mounts. On desktop this is
     shown as a QR code to scan with a signer on another device; on
     mobile it becomes a tappable deep link (next section).
   - **`bunker://…` URL** — paste a bunker URL the signer generates.
     Useful when the user already has a bunker connection string to
     hand.

The signer plumbing lives in `lib/nostr/` (`signers.ts`,
`nip46-login.ts`, `SignerContext`); the picker UI is
`components/auth/signer-method-buttons/` and
`components/auth/nostr-connect-panel/`.

## Mobile sign-in — the `nostrconnect://` deep link

On a phone, three of the four attach paths are poor: the NIP-07
extension does not exist, the QR is on the same screen the user
would scan *with*, and the bunker URL means many app-switches to
copy a string. That leaves `nsec` paste — the path we least want
users on.

So **on coarse-pointer (touch) devices, the NIP-46 flow leads with a
tappable `nostrconnect://` deep link** instead of a QR. Tapping the
link hands the live connect URI to an installed signer — Amber and
other Android signers deep-link `nostrconnect://` URIs, and the OS
app chooser offers any app that registers the scheme (Amber, Primal,
nsec.app, …). The user approves in the signer, and the connection
completes over the relay channel the page is already listening on.
One tap → approve → done, with no key paste and no second device.

Mechanics:

- `useIsMobile()` (`lib/hooks/useIsMobile.ts`) wraps
  `useMediaQuery("(pointer: coarse)")`. It is SSR-safe (false on the
  server and the first client render).
- On mobile, `NostrConnectPanel` renders an "Open in your signer
  app" anchor whose `href` is the live `nostrconnect://` URI, and
  demotes the QR + copy-URI field into a collapsed "Or scan from
  another device" `<details>` fold. The anchor deliberately omits
  `target="_blank"`/`rel`: a custom scheme is an OS app hand-off, not
  an external link, so a blank tab would strand the user.
- `SignerMethodButtons` relabels the NIP-46 entry from "Scan QR" to
  "Open your signer app" and hides the extension button.

This is a presentation-layer change over the existing NIP-46
plumbing — no new server endpoint, signer type, or session change.

**Why not NIP-55?** Amber also implements NIP-55 (`nostrsigner:`
Android intents), which avoids relays entirely. It was rejected for
now: it is Android-only, prompts the user for *every* signature
instead of holding a session, and adds a second signing path to
maintain. NIP-46 over a relay is the recommended web posture and
already works cross-platform. Decision in ADR
[0025-mobile-login-via-nostrconnect-deep-link](../architecture/decisions/0025-mobile-login-via-nostrconnect-deep-link.md).

## Session shape

- `jose`-signed JWT.
- Stored in an httpOnly, Secure, SameSite=Lax cookie.
- Carries the pubkey, the session expiry, and nothing else (never a
  private key, never the kind:0 metadata, never the payout fields).
- Verified on every panel-gated request by the edge middleware in
  `proxy.ts`; anonymous requests bounce to
  `/sign-in?next=<original>`.

The JWT signing key lives in env vars and never reaches the client.
Rotating it invalidates every active session at once; that is the
intended trade-off versus per-user revocation lists.

## Re-sign on payment-destination fields

Sign-in proves you control the pubkey *right now*. But a session
cookie is just a cookie — if it leaks, an attacker could in
principle quietly redirect a seller's settlement to their own bank
account by editing `/settings`.

The defence is a **per-mutation re-sign** on the fields that control
where money goes:

- `users.cbu` (Argentine bank account)
- `users.alias` (Argentine bank alias)
- `users.lightning_address` (the **payout** LN address)
- `users.nwc_uri` (the NWC payout connection)
- `users.payout_method` (the rail dispatch field)

`users.nostr_lightning_address` is deliberately **not** in this
list — it is the public Nostr `lud16`, not a payout destination, so
editing it on the Profile tab needs no re-sign (ADR 0030; see
[nostr-identity](./nostr-identity.md)).

The PATCH handler (`app/api/settings/route.ts`, with the payload
helper in `lib/creator/sign-settings-payload.ts`) refuses to write
any of these unless the request carries a freshly signed Nostr event
proving the *same* pubkey re-asserted intent at save time. A stolen
cookie alone is not enough — the attacker would also need to be
holding the private key, which means they were already the user.

Lightning Address changes additionally pass through a 1-sat LUD-21
probe before they're accepted. See
[settings-and-payouts](./settings-and-payouts.md) for the full PATCH
flow.

## What we do not do

- **Email.** No email field at sign-up, no email recovery, no email
  DMs. Decision in ADR
  [0006](../architecture/decisions/0006-nostr-and-inapp-delivery.md).
- **Password.** Never. There is no password field anywhere in the
  app; sign-in is exclusively via Nostr signers.
- **Drop-in signer library.** No `nostr-login` / NDK modal — the
  project has a bespoke, well-factored signer stack and the re-sign
  flow is wired through it (ADR 0025, alternatives considered).
