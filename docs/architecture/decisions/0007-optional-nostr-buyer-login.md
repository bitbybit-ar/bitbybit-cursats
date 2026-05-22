# 0007. Make Nostr login optional for buyers, never required

- **Date**: 2026-05-06
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | Decision | The NWC-derived-pubkey identity tier and the automatic-DM behaviour described here are gone — the server Nostr-DM channel and the NWC env were removed as dead code. The optional-buyer-login decision (anonymous vs signed-in) is unchanged. | The DM/NWC code no longer exists; the doc must not present those tiers as current. |
| 2026-05-06 | — | Initial version. | Pin the buyer-identity model before any auth or order-persistence code lands, and reconcile with ADR 0006 which assumed no buyer accounts. |

---

## Context

ADR [0006](0006-nostr-and-inapp-delivery.md) committed Cursats to two
buyer identities:

- **Pre-paid buyers**: an opaque, unguessable `orderId` in the
  receipt URL is the only identity. No account, no session.
- **Auto-renewal subscribers**: the Nostr pubkey extracted from the
  NWC connection is the identity. No login UI — the connection is
  the identity.

That model is correct for the moment of purchase, but it leaves a
gap once the buyer has bought *more than once*:

- A pre-paid buyer who bought two packs has two unrelated receipt
  URLs and no way to see them in one place. Losing a URL means
  losing access to the redemption code.
- A subscriber's pubkey is known to Cursats but never surfaced as an
  account — so they cannot review past renewals or cancel without
  digging through DMs.
- The asymmetry between "URL identity" and "NWC pubkey identity"
  forces every future feature (order history, refund requests,
  re-issuing a download link) to be built twice.

Sister project **bitbybit-arena** already has a working Nostr auth
module (NIP-07 browser extension, raw nsec paste, Nostr Connect /
NIP-46 remote signer) backed by a `jose` JWT in an httpOnly cookie,
with `nostr-tools` for verification. It is production-tested, it
matches BitByBit's family-wide identity model, and it can be
copied into Cursats with minimal adaptation.

The product principle in `docs/about/mission.md` ("we say no to
login systems") reflected an aversion to *required* accounts that
gate the purchase flow. It did not anticipate an *optional*
account that unlocks a history view without ever blocking a sale.
This ADR draws that line explicitly.

## Decision

**Login is never required to buy. Login is always available to
buyers who want a persistent order history and reliable push
notifications.**

Three buyer identity tiers exist, in increasing order of
commitment:

1. **Anonymous**. Buyer pays, lands on
   `/[locale]/gracias/[orderId]`, sees the redemption code or
   download URL, walks away. The opaque URL is the only access
   key. No row in any user table. This tier is the floor — every
   other tier must remain an opt-in addition on top of it.
2. **Anonymous with Nostr identifier**. At checkout, the buyer
   may paste an `npub1...` *or* a NIP-05 identifier
   (`name@domain.com`). The server resolves NIP-05 to a pubkey
   via the well-known endpoint, then sends an encrypted NIP-44
   DM with the receipt URL after settlement. No session, no
   cookie, no login. The order row stores the pubkey for the DM
   only.
3. **Logged-in via Nostr**. The buyer signs in (before, during,
   or after a purchase) using the auth module ported from arena —
   NIP-07, raw nsec, or NIP-46 Nostr Connect. A `jose`-signed JWT
   lives in an httpOnly cookie. Past and future orders are linked
   to the session pubkey. A `/[locale]/mis-compras` page lists
   them. DMs are sent automatically; no need to paste an
   identifier at checkout. A buyer who paid anonymously and
   later signs in can claim that order by entering its `orderId`
   while authenticated — the server attaches the pubkey to the
   row.

Subscribers (auto-renewal, ADR
[0005](0005-prepaid-default-autorenewal-optin.md)) get tier 3
implicitly: the pubkey from their NWC connection is treated as a
session pubkey for the order-history view. They do not need to
log in separately, but they *can* explicitly log in with the same
pubkey (for example from another device) to access history.

**Storage.** Orders move from the implicit "URL is the only key"
model to a persisted row in Postgres, accessed via `drizzle-orm`
(matching arena's stack). Schema sketch:

```text
orders
  id            uuid primary key            -- the opaque orderId
  pubkey        text nullable               -- null = tier 1
  offering_id   text                        -- ref to merchant.yaml
  status        enum(...)                   -- pending|paid|...
  amount_sats   integer
  amount_ars    integer
  created_at    timestamptz
  paid_at       timestamptz nullable
  ...
```

`pubkey` is nullable on purpose — anonymous orders never get one.
The opaque `id` remains a valid access key for any tier (so a
logged-in buyer who shares the URL with a colleague still works).

The catalog itself stays config-driven (ADR
[0004](0004-static-config-deployment.md)): `merchant.yaml` is
still the source of truth for offerings. Only the *transactional*
data (orders, payments, sessions) lives in Postgres. This ADR
does not turn Cursats into a multi-tenant SaaS — each merchant
still forks and deploys their own instance, with their own
Postgres database.

Settlement is unchanged (ADR
[0002](0002-settlement-via-wapu.md)) — Wapu remains the only
rail. Login is an identity feature, not a payments feature.

## Consequences

### Positive

- One identity model for the entire family. Buyers who use arena
  recognise the same sign-in flow.
- Persistent order history without ever blocking a sale. The
  anonymous floor in ADR 0006 stays intact.
- Logged-in buyers automatically get DMs without needing to paste
  an npub at every checkout.
- NIP-05 support lowers the bar for buyers who already have an
  identifier on a Nostr-aware service but no browser extension.
- Subscribers and pre-paid buyers stop being two parallel
  codepaths for any history- or notification-related feature.
- Reusing arena's auth module saves implementation cost and
  inherits its NIP-07 / nsec / NIP-46 coverage on day one.

### Negative

- Cursats now has a Postgres dependency. Forking merchants must
  provision a database (Vercel Postgres or self-hosted) and run
  drizzle migrations. Previously a Cursats deployment had no
  stateful store besides Wapu's records.
- An auth surface is an attack surface. Session cookies, JWT key
  rotation, NIP-46 relay handling, and NIP-05 resolution all need
  the same scrutiny we already give the Wapu webhook.
- The product story now has a third tier to explain in copy and
  onboarding. Mission language must distinguish *required* vs
  *optional* accounts carefully or it sounds like we contradicted
  ourselves.

### Neutral

- A future merchant-facing admin login could reuse the same auth
  module. Out of scope for v1.
- The "claim a past anonymous order by pasting its `orderId`"
  flow is the obvious migration path for buyers who decide later
  that they want history. Implementation detail; no separate ADR
  needed unless the UX gets complicated.

## Alternatives considered

- **Keep the opaque-URL-only model (status quo)**. Rejected:
  forces buyers to bookmark every URL and blocks any future
  feature that needs a stable identity (history, refunds,
  re-issuance, abuse handling).
- **Require Nostr login for every purchase**. Rejected: violates
  the mission's "no login systems" principle in spirit and adds
  friction at the moment of charging the buyer. The whole point
  of the anonymous floor is that someone with no Nostr extension
  can still complete a sale.
- **Email-based accounts**. Rejected for the same reasons as ADR
  [0006](0006-nostr-and-inapp-delivery.md) — we are not adding an
  email-sender dependency or an inbox-deliverability surface.
- **Build a new auth module instead of porting arena's**.
  Rejected: arena's module is production-tested, covers the three
  signer methods we need, and any divergence between the two
  projects on identity primitives is a future maintenance tax.
- **Use a session in localStorage instead of an httpOnly cookie**.
  Rejected: the JWT must be unreadable by client JS so that a
  compromised dependency cannot exfiltrate it. arena already made
  this call; we follow.

## References

- ADR [0002](0002-settlement-via-wapu.md) — settlement is
  Wapu-only and untouched by this decision.
- ADR [0004](0004-static-config-deployment.md) — catalog stays
  config-driven; only transactional data is persisted.
- ADR [0005](0005-prepaid-default-autorenewal-optin.md) — NWC
  pubkey for subscribers fits cleanly into tier 3.
- ADR [0006](0006-nostr-and-inapp-delivery.md) — DM delivery now
  has a third trigger (logged-in session) on top of npub-at-
  checkout and NWC-derived pubkey.
- [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md)
  — DNS-based identifier resolution.
- [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)
  — browser-extension signing.
- [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md)
  — encrypted DMs.
- [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md)
  — Nostr Connect remote signer.
- bitbybit-arena auth module:
  `app/api/auth/{nostr,session,signout}` and
  `components/auth/{ExtensionSignerButton,NsecSignerForm,NostrConnectPanel,SignerMethodButtons,ExtensionUpsell}`.
