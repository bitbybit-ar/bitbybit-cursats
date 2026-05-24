# Notifications

> **Status:** Active
> **Last updated:** 2026-05-24

---

## Change Log

| Date | Section | Change | Reason |
|---|---|---|---|
| 2026-05-24 | Event types | Noted that the buyer-paid confirmation poll on the `direct_lightning` rail can be the LUD-21 `verify` URL or NWC `lookup_invoice`. | ADR 0029 — NWC is a second sats-rail input method; the buyer-paid effects (incl. notifications) are shared across both. |
| 2026-05-23 | The bell, Event types | Documented the mobile drawer presentation, the Preferences toggles, and the three `payout.*` seller events. | Mobile/UX pass — the bell dropdown was clipped on phones; payout toggles are now user-facing. |
| 2026-05-22 | Surfaces, Event types, Pointers | Removed the Nostr-DM surface (the bell is now the only notification channel) and the Wapu-webhook code pointers. | The server Nostr-DM channel and the Wapu webhook were removed as dead code. |
| 2026-05-21 | — | Initial version. | Hackathon documentation pass — describe the in-app notification bell, the event types, the read-state mechanics, and the relationship to outgoing Nostr DMs. |

---

## Table of Contents

1. [Two surfaces, two audiences](#two-surfaces-two-audiences)
2. [The bell — in-app, polled](#the-bell--in-app-polled)
3. [Event types](#event-types)
4. [Read-state mechanics](#read-state-mechanics)
5. [What never fires](#what-never-fires)
6. [Where to look in the code](#where-to-look-in-the-code)

---

## Two surfaces, two audiences

Cursats notifies two parties when an order moves through its
state machine:

- **The buyer**, that their payment cleared and the receipt is
  ready.
- **The seller**, that a sale just landed in their `/orders`
  list.

Both are surfaced through the **in-app bell** in the navbar —
polled, persistent until marked read, available to any signed-in
user. There is no Nostr DM or email channel; the bell (and, for
buyers, the receipt page) is the whole notification surface. This
doc is about the **bell**.

## The bell — in-app, polled

Every signed-in user sees a bell icon in the navbar with an
unread count badge (capped at `9+`). The client polls
`GET /api/notifications` periodically (a small interval, on the
order of half a minute) and updates the badge from the response.

Polling, not WebSockets. Reasons:

- The notification rate is low (a typical user sees a few
  notifications per day, not per second). WebSockets cost more
  in connection state than they save.
- Vercel's serverless model fits polling natively; long-lived
  socket connections require a different deployment shape.
- The latency cost is bounded by the poll interval and is
  acceptable for "your order is ready" — the receipt page is
  already there to be visited directly.

Opening the bell renders the most recent N notifications with their
titles, bodies, and timestamps; clicking a row marks it read (via
`PATCH /api/notifications`) and routes to the relevant page. A "Mark
all as read" button flips every unread row for the caller in a single
query (`POST /api/notifications`). On desktop the bell opens a
dropdown; on phones it opens the same list **inside the slide-in menu
drawer** (reached from the drawer's bell, dismissed with a back arrow),
since an absolutely-positioned dropdown was clipped off-screen there.
Both presentations share one `useNotifications` hook and the
`NotificationList` component.

Which events ring the bell is per-user: the **Preferences** tab in
`/settings` toggles each event type on or off (missing or non-`false`
means enabled).

The notification row stores everything in Postgres:
recipient pubkey, type, title (i18n-resolved at render time on
the client, falling back to an English string in the row),
metadata (the order id, the offering title, the counterparty's
display name), and `read_at`.

## Event types

Two events fire off the buyer-paid confirmation poll (the Wapu deposit
transaction, or — on the `direct_lightning` rail — the LUD-21 `verify`
URL or NWC `lookup_invoice` flipping an order to `paid`); three more
track the ARS seller-payout leg:

### `order.paid` — to the buyer

Fires when an order the buyer paid for confirms. Carries:

- The offering title.
- The seller's display name and slug.
- A link to `/receipt/[orderId]`.

Only enqueued if the buyer is identifiable — i.e., the order has
a pubkey attached, either because the buyer was signed in or
because they connected an identifier at checkout. Anonymous
purchases generate no `order.paid` (the buyer never opens the
bell because they never log in).

### `sale.received` — to the seller

Fires when an order against any of the seller's offerings
confirms. Carries:

- The offering title.
- The buyer's display name and avatar (if the buyer was
  identifiable; otherwise "buyer anónimo").
- The settlement rail and the amount (in sats and ARS).
- A link to `/orders/[orderId]`.

Always enqueued — the seller is always identifiable, because by
definition the offering belongs to a user row.

### `payout.pending` / `payout.released` / `payout.failed` — to the seller

Only on the ARS (Wapu) rail, tracking the seller payout leg: the
withdrawal opening (`payout.pending`), the pesos settling to the
seller's CBU/alias (`payout.released`), and a failed transfer
(`payout.failed`). Direct-Lightning sales have no payout leg and emit
none of these. All three are toggleable in Preferences.

Future event types (refund initiated, code redeemed) are out of scope
for v1.

## Read-state mechanics

- Notifications are stored with `read_at = null` on insert.
- The bell badge counts rows where `read_at IS NULL` and
  `user_id = session.user_id`.
- Clicking a row issues `PATCH /api/notifications` with the row
  id; the server stamps `read_at = now()`. The dropdown closes
  and the browser navigates to the row's link.
- "Mark all as read" issues `POST /api/notifications` (no body
  needed beyond the session); the server runs a single UPDATE
  setting `read_at = now()` where `user_id = session.user_id AND
  read_at IS NULL`.
- Ownership is enforced server-side on every mutation. The
  `WHERE` clause pairs `user_id = session.user_id` with the row
  id, so a caller cannot mark or read another user's
  notifications by guessing IDs.

There is no per-type read state ("mark all order.paid as read");
all notifications participate in the same unread set.

## What never fires

A few cases that *could* generate notifications but deliberately
do not:

- **Self-triggered events.** A seller paying for their own
  offering (rare, but possible during testing) does not fire
  `order.paid` to themselves *and* does not fire `sale.received`
  either. The system checks for matching pubkeys before
  enqueuing.
- **Unpaid orders.** An order that stays `pending` (or ends up
  `failed` / `refunded`) does not notify anyone. There is nothing
  to celebrate or commiserate.
- **Settings changes.** Changing payout method or slug does not
  notify; the user just did it themselves.
- **Anonymous buyer notifications.** As noted above, an
  anonymous buyer cannot receive an `order.paid` because there
  is no recipient to address it to. They keep the receipt URL
  from the checkout page.

## Where to look in the code

| What | Where |
|---|---|
| Notification helpers (incl. `emitNotification`) | `lib/notifications.ts` |
| API surface (GET / PATCH / POST) | `app/api/notifications/route.ts` |
| Notification row schema | `lib/db/schema.ts` (the `notifications` table) |
| Enqueue on deposit/verify confirmation | `app/api/orders/[orderId]/route.ts` (calls `emitNotification` after `markOrderPaid`) |
| Enqueue on payout settlement | `lib/wapu-settlement.ts` (via the settlement cron / seller sync) |
