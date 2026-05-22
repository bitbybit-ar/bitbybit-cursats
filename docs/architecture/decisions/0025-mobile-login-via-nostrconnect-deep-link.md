# 0025. Mobile login via nostrconnect:// deep link

- **Date**: 2026-05-22
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | — | Initial version. | Record why mobile sign-in leads with a tappable `nostrconnect://` deep link (reusing the existing NIP-46 relay session) instead of QR or bunker-URL paste, and why we did not adopt NIP-55 Android intents. |

---

## Context

Sign-in (`/sign-in`) offers four ways to attach a Nostr signer:
NIP-07 browser extension, `nsec` paste, NIP-46 QR
(`nostrconnect://`), and NIP-46 bunker-URL (`bunker://`) paste. All
four converge on the same server contract — a NIP-98 event posted to
`/api/auth/nostr` (see ADR
[0007](0007-optional-nostr-buyer-login.md)).

On a phone, three of those four are poor:

- **NIP-07 extension** does not exist in mobile browsers. The button
  renders disabled with a "no extension" hint — dead weight on a
  phone.
- **QR (`nostrconnect://`)** asks the user to *scan* a code, but the
  code is on the same screen they would scan with. Single-device
  users cannot use it; it only works when a second device holds the
  signer.
- **Bunker URL** forces the user to leave the browser, open their
  signer, generate a `bunker://` URL, copy it, switch back, and
  paste — many app switches for one login.

That leaves `nsec` paste as the path of least resistance on mobile,
which is exactly the path we least want users on: it puts the raw
secret key into the web page.

The infrastructure to do better already exists. `lib/nostr/nip46-
login.ts` mints a `nostrconnect://` URI and opens a relay rendezvous
(`createConnectSession` + `waitForConnection`) the moment the QR
panel mounts. Crucially, **Amber and other Android signers
deep-link `nostrconnect://` URIs** (greenart7c3/Amber#14): tapping
such a link launches the installed signer with the URI pre-filled,
the user approves, and the connection completes over the relay
channel we are already listening on. The same scheme reaches any
installed app that registers it (Primal, nsec.app, …) via the OS app
chooser.

A second option exists for Android specifically — **NIP-55**
(`nostrsigner:` Android intents), which Amber also implements. It
avoids relays entirely but is Android-only and, by design, prompts
the user for *every* signature rather than holding a session; the
NIP-46 author and the NostrConnect guidance both recommend web apps
prefer NIP-46 for this reason.

## Decision

**On coarse-pointer (touch) devices, lead the NIP-46 flow with a
tappable `nostrconnect://` deep link and demote the QR to a
cross-device fallback. Reuse the existing relay session and the
unchanged NIP-98 server contract. Do not adopt NIP-55.**

Concretely:

- A new `useIsMobile()` hook
  (`lib/hooks/useIsMobile.ts`) wraps `useMediaQuery("(pointer:
  coarse)")` — the signal for "this device can hand a
  `nostrconnect://` URI to an installed signer." It is SSR-safe
  (false on the server and first client render).
- `NostrConnectPanel` (QR mode) renders, on mobile, an "Open in your
  signer app" anchor whose `href` is the live `nostrconnect://`
  URI. The QR + copy-URI field move into a collapsed "Or scan from
  another device" `<details>` fold. Desktop is unchanged
  (QR-first). The anchor deliberately omits `target="_blank"`/`rel`:
  a custom scheme is an OS app hand-off, not an external http(s)
  link, and a blank tab would be stranded.
- `SignerMethodButtons` hides the extension button on mobile (only
  when another method is available, so an `extension`-only re-attach
  flow never renders an empty picker) and relabels the NIP-46 entry
  from "Scan QR" to "Open your signer app".
- No change to `lib/nostr/signers.ts`, the relay set, the session
  cookie, or `/api/auth/nostr`. This is a presentation-layer change
  over the existing NIP-46 plumbing.

This does not introduce a settlement rail, a signer type, or a
server endpoint; it re-presents an existing one.

## Consequences

### Positive

- Same-device mobile login becomes one tap → approve in signer →
  done, with no key paste and no second device.
- Reuses the existing relay rendezvous and NIP-98 contract;
  blast radius is the three auth UI components plus one hook and
  i18n keys. No migration, no new dependency.
- Signer-agnostic: any installed app that registers
  `nostrconnect://` (Amber, Primal, nsec.app, …) is offered by the
  OS, so we are not betting on one wallet.
- Pushes users off `nsec` paste — the least safe path — toward
  remote signing where the key never enters the page.

### Negative

- The deep link silently no-ops if no signer handles the scheme
  (none installed, or a desktop touchscreen). Mitigated by the
  always-present QR/copy fold and the existing 10s "open your
  signer and approve" slow hint.
- Backgrounding the browser while approving in the signer can throttle
  the page's timers/socket; the 60s `NIP46_TIMEOUT_MS` may lapse on a
  slow approve, dropping the user to the existing "expired → retry"
  state. Acceptable for v1; revisit the timeout if it bites.
- `(pointer: coarse)` also matches touchscreen laptops, where the
  deep link won't resolve. Harmless — the QR/copy fallbacks remain,
  and an extension (if present) is still shown because the extension
  button only self-hides when `window.nostr` is absent.

### Neutral

- Desktop sign-in is visually unchanged.
- The server still only ever sees a NIP-98 event; it cannot tell a
  deep-link login from a scanned-QR login.

## Alternatives considered

- **NIP-55 Android intents (`nostrsigner:`).** Rejected for now:
  Android-only, prompts per-signature instead of holding a session,
  and adds a second signing path to maintain. NIP-46 over a relay is
  the recommended web posture and already works cross-platform. Left
  as a future option if we want relay-free Android signing.
- **Adopt a drop-in library (`nostr-login` / NDK).** Rejected: the
  project already has a bespoke, well-factored signer stack
  (`lib/nostr/`, `SignerContext`, the re-sign flow). Swapping it for
  a third-party modal is a large rewrite for a UX gap a small,
  contained change closes.
- **Leave mobile on `nsec` paste (status quo).** Rejected: it is the
  least safe path and the one a phone user falls into by default once
  the extension and QR options prove unusable.

## References

- ADR [0007](0007-optional-nostr-buyer-login.md) — the NIP-98
  sign-in contract this decision re-presents on mobile.
- [NIP-46 — Nostr Connect](https://nips.nostr.com/46).
- [NIP-55 — Android Signer Application](https://nips.nostr.com/55)
  (the rejected alternative).
- [greenart7c3/Amber#14](https://github.com/greenart7c3/Amber/issues/14)
  — Amber deep-links `nostrconnect://` URIs.
- `lib/nostr/nip46-login.ts`, `components/auth/nostr-connect-panel/`,
  `components/auth/signer-method-buttons/`, `lib/hooks/useIsMobile.ts`.
