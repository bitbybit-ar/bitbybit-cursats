# 0025. Wapu as a poll-driven, two-leg settlement rail

- **Date**: 2026-05-21
- **Status**: Accepted
- **Deciders**: BitByBit team
- **Last updated**: 2026-05-21

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-21 | — | Initial version. | Pin the real Wapu integration shape after confirming the API against staging; supersede the webhook posture of ADRs 0002 and 0012. |

---

## Context

ADRs [0002](0002-settlement-via-wapu.md) and
[0012](0012-multi-tenant-marketplace.md) assumed Wapu behaved like a
Stripe-style PSP: we would create a single payment, the buyer would
pay it, and Wapu would fire a signed **webhook** that flipped the
order to `paid` and pushed ARS to the seller. The code modelled this
with a `WAPU_WEBHOOK_SECRET`, an HMAC verifier, a
`/api/wapu/webhook` route, and a single `wapu_tentative_uuid` per
order.

That model was wrong. Confirming the live API (`docs.wapupay.com`,
verified against staging `be-stage.wapu.app`) showed:

- **Wapu is a USDT-ledger wallet, not a PSP.** A Lightning deposit
  credits USDT to *our* wallet; a separate fiat transfer moves ARS
  out to a destination CBU/alias.
- **There are no webhooks.** State is observed by polling
  `GET /transactions/{id}`. The terminal success status is
  `Completed`; failure is `Rejected`/`Canceled`.
- **Settlement to the seller is a second, independent transaction**
  that can take a couple of hours to clear.

So a single Cursats order maps to **two** Wapu transactions, both
polled, with the seller payout lagging the buyer payment.

## Decision

Model the `wapu_ars` rail as two polled legs.

**Leg 1 — deposit (buyer → our wallet).** At checkout we size the
buyer's sats from the ARS price and call
`POST /wallet/deposit_lightning`, storing the returned
`transaction_id` (`orders.wapu_deposit_tx_id`) and BOLT11. The buyer's
checkout page polls `/api/orders/[orderId]`, which calls
`GET /transactions/{id}`. On `Completed` we mark the order `paid`,
record the USDT credited (`orders.amount_usdt`), draw the redemption
code, emit `order.paid`/`sale.received`, and open leg 2.

**Leg 2 — withdrawal (our wallet → seller).** We call
`POST /transactions/create` (`fiat_transfer` or `fast_fiat_transfer`
per the seller's `transfer_speed`) to settle ARS to the seller's
CBU/alias, storing `orders.wapu_withdrawal_tx_id` and
`orders.payout_status = 'pending'`, and notify the seller
(`payout.pending`). The Vercel Cron `/api/cron/wapu-settlements`
polls pending withdrawals and flips `payout_status` to `released`
(notify `payout.released`) or `failed` (notify `payout.failed`). The
cron also retries paid orders whose withdrawal never opened and
re-polls pending deposits as a buyer-left-the-page safety net.

Schema (migrations `0011`, `0012`):

- `users.transfer_speed enum('fiat_transfer','fast_fiat_transfer')`,
  default `fiat_transfer`, chosen in `/settings`.
- `orders.wapu_deposit_tx_id`, `orders.wapu_withdrawal_tx_id`
  (renamed from `wapu_tentative_uuid` / `wapu_settlement_ref`).
- `orders.payout_status enum('pending','released','failed')`,
  `orders.payout_released_at`, `orders.amount_usdt numeric(18,8)`,
  and a snapshot of `orders.transfer_speed`.

Auth is the `X-API-Key` header against `WAPU_PAY_APU_HOST`
(`be-stage` / `be-prod`). `WAPU_WEBHOOK_SECRET` and the
`/api/wapu/webhook` route are removed. The client is `lib/wapu.ts`
(with an in-process `MockWapuClient` for dev/CI); orchestration is
`lib/wapu-settlement.ts`.

## Consequences

### Positive

- The integration matches reality and is verified against staging.
- No webhook endpoint to secure; nothing to forge. Both rails settle
  by polling resources we already hold ids for.
- The buyer sees confirmation as soon as the deposit clears, without
  waiting on the slower ARS payout.

### Negative

- The seller payout depends on a cron; if the cron is wedged, payouts
  stall in `pending` until it runs again. The settlement endpoint is
  guarded by `CRON_SECRET`.
- Polling `GET /transactions/{id}` per pending order costs Wapu API
  calls proportional to in-flight volume. Fine at hackathon scale.

### Neutral

- **Open decision: who absorbs the Wapu fee + rate drift.** v1 sizes
  the deposit from the ARS price at the current rate and withdraws the
  full ARS price to the seller; the withdrawal fee (charged in USDT on
  top of `payment_amount`) and any rate drift between the two legs are
  absorbed by the platform float. A future revision may pass the fee
  to the seller (the `tentative-amount` preview at course creation is
  intended to surface it) or to the buyer.
- The deposit/withdrawal response shapes are not in the published
  OpenAPI spec; field mapping was reverse-engineered from live
  staging transactions and is normalized in one place
  (`normalizeTransaction` in `lib/wapu.ts`).

## Alternatives considered

- **Keep the webhook model and wait for Wapu to ship webhooks.**
  Rejected: Wapu has no webhook product; polling is the supported
  path and works today.
- **One transaction for the whole flow.** Not possible: the deposit
  and the fiat payout are distinct Wapu transactions with independent
  lifecycles.
- **Poll the deposit only on the client; never run a cron.** Rejected:
  the seller payout clears hours later, long after the buyer closes
  the page. A server-side cron is the only place that leg can be
  driven to completion.

## References

- ADR [0002](0002-settlement-via-wapu.md) — original Wapu-only
  decision; its webhook posture is superseded here.
- ADR [0012](0012-multi-tenant-marketplace.md) — direct-payment +
  webhook shape is superseded here.
- ADR [0015](0015-sats-settlement-rail.md) — the two-rail split and
  the `direct_lightning` LUD-21 poll, unchanged.
- ADR [0022](0022-live-exchange-rate-via-yadio.md) — the sats↔ARS
  rate seam still backs deposit sizing; swapping it to Wapu's
  `/exchange_rates` is a tracked follow-up.
- Wapu API docs: <https://docs.wapupay.com/api-docs>.
