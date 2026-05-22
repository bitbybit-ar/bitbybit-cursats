# 0005. Pre-paid is always on; auto-renewal is opt-in per merchant

- **Date**: 2026-05-05
- **Status**: Superseded by [0020](0020-defer-autorenewal-from-mvp.md) — autorenewal is deferred from v1; pre-paid one-shot purchases are the only flow we ship.
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-22

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-22 | — | Note: the NWC client, cron handler, and `NWC_CONNECTION_URL` env referenced throughout this (already superseded) ADR were removed as dead code. | Those env vars and code no longer exist; the doc must not imply they ship. |
| 2026-05-14 | Status | Marked Superseded by ADR 0020. The pre-paid half of this decision stands; the autorenewal half is dropped from MVP. | The settings page no longer surfaces an autorenewal toggle and no checkout/cron code reads the flag. Keeping ADR 0005 "Accepted" would mislead a future contributor reading the docs cold. |
| 2026-05-06 | Decision, Consequences | Autorenewal flag moves from a build-time `merchant.yaml` field to a runtime panel toggle stored in `settings.features_autorenewal` (Postgres). Reworded "stay unwired" to "stay dormant when the flag is false, gated by a runtime check": the NWC client, cron handler, and encrypted-secrets storage are now deployed in every build but only execute when the toggle is on. | ADR 0009 moves runtime settings into Postgres and ADR 0008 introduces a panel where the merchant can flip this flag at any time. A build-time flag cannot be flipped at runtime, so the code must always be present; the security posture changes from "absent" to "dormant", which has to be recorded. |
| 2026-05-06 | Decision | Replaced "an email is sent" with "a Nostr DM is sent" for cancellation notices, consistent with ADR 0006. The auto-renewal payment model itself is unchanged. | The original phrasing assumed an email channel that ADR 0006 explicitly rules out. NWC subscribers' pubkey is already known, so DMs are the natural push channel. |
| 2026-05-05 | — | Initial version. | Pin the payment model before scaffolding so the auto-renewal code path can be cleanly gated from day one. |

---

## Context

Lightning has no native subscriptions. There is no "card on file"
primitive that lets a merchant pull a recurring payment from a
buyer without the buyer initiating each time. The closest
production-ready mechanism is Nostr Wallet Connect (NWC), which
lets a buyer grant a budgeted, time-boxed permission to a service.
Today NWC is supported by a handful of wallets (Alby, Mutiny,
Coinos, Primal); most Lightning users do not have an NWC-capable
wallet.

Wapu itself does not implement subscriptions, BOLT12, or NWC. It
exposes one-shot Lightning invoices in and ARS withdrawals out.
Any recurring billing must be built on top.

The merchant audience splits cleanly: some educators want recurring
billing because their offering is a monthly bono; others want
nothing more than one-shot pack sales because their students don't
have NWC wallets and don't want to set one up.

## Decision

Cursats ships **two payment flows**, with a per-merchant opt-in:

- **Pre-paid one-shot** is always on. Every offering can be sold
  as a single Lightning invoice. This works for every Lightning
  wallet that exists today.
- **NWC auto-renewal** is opt-in via a single runtime flag,
  `settings.features_autorenewal`, edited by the merchant from
  `/[locale]/panel/configuracion`. When `false`, the NWC client,
  the cron handler, and the encrypted-secrets storage are
  *deployed but dormant* — the code is present in every build,
  gated by a runtime check on the flag. When `true`, every
  offering exposes a second "Autorenovar" button alongside
  "Comprar," and the daily cron pull executes. Flipping the
  toggle takes effect immediately; no redeploy.

There is no buyer-side wallet detection. If a buyer's wallet
cannot complete the NWC connection, the auto-renewal flow simply
fails and the buyer falls back to the one-shot button.

Renewals that fail (insufficient budget, wallet offline, NWC
permission expired) enter a grace window; after N retries the
subscription is cancelled and a Nostr DM is sent (the subscriber's
pubkey is already known via the NWC connection — see ADR
[0006](0006-nostr-and-inapp-delivery.md)).

## Consequences

### Positive

- Every merchant can use the kit on day one, regardless of their
  students' wallets.
- Merchants who do not want subscription complexity (cancellations,
  failed renewals, customer-service load) leave the flag off and
  never see the surface.
- The pitch is honest about Lightning's current limitations:
  pre-paid is the renewal flow that works in production today;
  NWC is the differentiator stretch.
- The opt-in flag means the cron, NWC client, and secret-store
  code paths are inert in deployments that don't need them. With
  the flag now a runtime toggle (ADR 0009), the code is deployed
  but never executes when the flag is off — slightly larger
  attack surface than the original "fully unwired" posture, but
  the trade is necessary so the merchant can enable autorenewal
  later without a redeploy.

### Negative

- Two payment paths in the codebase. Both must be tested.
- Auto-renewal requires the merchant to commit to operational
  concerns (cancellation requests, retry policies,
  recurring-revenue tax implications). Documented in onboarding.

### Neutral

- BOLT12 offers and other future Lightning recurring-payment
  primitives can be added as additional opt-in surfaces under the
  same `features.*` namespace.

## Alternatives considered

- **Pre-paid only** — rejected as the v1 default for any merchant
  who explicitly wants subscriptions.
- **Auto-renewal always on** — rejected; forces every merchant to
  carry the operational burden whether they want it or not.
- **Buyer-side wallet detection that hides the auto-renewal
  button for non-NWC wallets** — rejected; buyers came to a sats
  checkout to pay sats, the merchant's flag is the only real
  decision. Two visible buttons let the buyer self-select.

## References

- <https://github.com/getAlby/sdk> — likely NWC client.
- ADR [0002](0002-settlement-via-wapu.md) — settlement.
- ADR [0003](0003-educator-vertical.md) — product wedge.
- ADR [0006](0006-nostr-and-inapp-delivery.md) — delivery channel
  (provides the cancellation/renewal Nostr DMs referenced above).
