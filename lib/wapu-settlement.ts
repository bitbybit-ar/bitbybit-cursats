import "server-only";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  getWapuClient,
  isWapuTxComplete,
  isWapuTxFailed,
  depositUsdtCredited,
  type WapuTransferType,
} from "@/lib/wapu";
import {
  getOrder,
  markOrderPaid,
  markOrderFailed,
  drawAndAssignCode,
} from "@/lib/orders";
import { getOfferingById } from "@/lib/offerings";
import { getUserById, pickPayoutAlias } from "@/lib/creator/users";
import { emitNotification } from "@/lib/notifications";

type OrderRow = typeof orders.$inferSelect;

/**
 * Settlement orchestration for the two-leg wapu_ars rail (and the
 * shared buyer-paid notifications, reused by direct_lightning).
 *
 * No webhooks: the buyer leg is polled by the checkout status route
 * (`pollWapuDeposit`) and the seller leg by the settlement cron
 * (`pollWapuWithdrawal`). `openSellerWithdrawal` bridges the two and
 * is idempotent so the cron can retry a deposit that confirmed but
 * whose withdrawal never opened.
 */

/**
 * Emit the buyer-paid fan-out: `order.paid` to the buyer (when signed
 * in) and `sale.received` to the seller. Best-effort — a failure here
 * must not roll back a paid order.
 */
export async function emitOrderPaidNotifications(
  order: OrderRow
): Promise<void> {
  try {
    const [offering, seller] = await Promise.all([
      getOfferingById(order.offering_id),
      getUserById(order.user_id),
    ]);
    const payload = {
      order_id: order.id,
      offering_title: offering?.title ?? "",
    };
    if (order.pubkey) {
      await emitNotification({
        recipient_pubkey: order.pubkey,
        kind: "order.paid",
        payload,
      });
    }
    if (seller?.pubkey) {
      await emitNotification({
        recipient_pubkey: seller.pubkey,
        kind: "sale.received",
        payload,
      });
    }
  } catch (err) {
    console.warn(`[orders/${order.id}] notification emit failed:`, err);
  }
}

/**
 * Poll the buyer's Lightning deposit (leg 1) for a pending wapu_ars
 * order. On `Completed`: mark paid (recording the USDT credited),
 * draw a redemption code, emit buyer/seller notifications, and open
 * the seller withdrawal. On `Rejected`/`Canceled`: mark the order
 * failed. Transient errors leave the order pending so the buyer page
 * polls again. Returns the resulting order status.
 */
export async function pollWapuDeposit(
  order: OrderRow
): Promise<"pending" | "paid" | "failed"> {
  if (
    order.rail !== "wapu_ars" ||
    !order.wapu_deposit_tx_id ||
    order.status !== "pending"
  ) {
    return order.status === "paid" || order.status === "failed"
      ? order.status
      : "pending";
  }

  const wapu = getWapuClient();
  let tx;
  try {
    tx = await wapu.getTransaction(order.wapu_deposit_tx_id);
  } catch (err) {
    console.warn(
      `[orders/${order.id}] wapu deposit poll failed:`,
      err instanceof Error ? err.message : err
    );
    return "pending";
  }

  if (isWapuTxComplete(tx.status)) {
    const result = await markOrderPaid({
      order_id: order.id,
      amount_usdt: depositUsdtCredited(tx),
      paid_at: new Date(),
    });
    if (result.updated) {
      const draw = await drawAndAssignCode({ order_id: order.id });
      if (draw.status === "pool_empty") {
        console.warn(
          `[orders/${order.id}] code pool empty on wapu settle — manual intervention required`
        );
      }
      await emitOrderPaidNotifications(order);
      // Open the ARS payout leg. Best-effort; the cron retries any
      // paid order whose withdrawal never opened.
      await openSellerWithdrawal(order.id);
    }
    return "paid";
  }

  if (isWapuTxFailed(tx.status)) {
    await markOrderFailed({ order_id: order.id });
    return "failed";
  }

  return "pending";
}

export interface PayoutQuote {
  /** What the buyer paid, expressed in ARS. */
  gross_ars: number;
  /** Wapu's fee, converted to ARS. Borne by the seller. */
  fee_ars: number;
  /** What the seller actually receives: gross − fee. */
  net_ars: number;
  /** Wapu's ARS-per-USDT rate at quote time. */
  exchange_rate: number;
}

/**
 * Quote the seller's ARS payout for a given gross ARS amount and
 * transfer speed. The seller bears Wapu's fee (the platform is
 * "curSATS", not a PSP), so they receive `gross − fee`. Wapu's
 * tentative-amount endpoint returns the fee in USDT plus the
 * ARS/USDT rate; we convert the fee to ARS and net it out.
 *
 * Shared by the settlement path (`openSellerWithdrawal`) and the
 * create-course estimate so the displayed estimate and the actual
 * withdrawal use the same formula.
 */
export async function quoteSellerPayout(
  amountArs: number,
  type: WapuTransferType
): Promise<PayoutQuote> {
  const wapu = getWapuClient();
  const t = await wapu.tentativeAmount({
    amount: amountArs,
    currency_payment: "ARS",
    currency_taken: "USDT",
    type,
  });
  const feeArs = Math.round(t.fee * t.exchange_rate);
  return {
    gross_ars: amountArs,
    fee_ars: feeArs,
    net_ars: Math.max(0, amountArs - feeArs),
    exchange_rate: t.exchange_rate,
  };
}

/**
 * Open the seller's ARS withdrawal (leg 2) for a paid wapu_ars order.
 * Idempotent: a no-op if a withdrawal already exists or the order
 * isn't a paid wapu_ars order. On success, records the withdrawal id,
 * sets `payout_status = pending`, and notifies the seller that their
 * payout is on the way.
 */
export async function openSellerWithdrawal(orderId: string): Promise<void> {
  const db = getDb();
  const order = await getOrder(orderId);
  if (
    !order ||
    order.rail !== "wapu_ars" ||
    order.status !== "paid" ||
    order.wapu_withdrawal_tx_id ||
    order.payout_status
  ) {
    return;
  }

  const seller = await getUserById(order.user_id);
  if (!seller) return;
  const alias = pickPayoutAlias(seller);
  if (!alias) {
    console.error(
      `[orders/${orderId}] cannot open withdrawal: seller ${order.user_id} has no payout alias`
    );
    return;
  }

  const type = order.transfer_speed ?? "fiat_transfer";
  const wapu = getWapuClient();
  let withdrawal;
  try {
    // The seller absorbs Wapu's fee: they receive the gross ARS the
    // buyer paid, minus the fee. Withdraw the net.
    const quote = await quoteSellerPayout(order.amount_ars, type);
    withdrawal = await wapu.createWithdrawal({
      type,
      payment_amount_ars: quote.net_ars,
      alias,
      receiver_name: seller.display_name,
    });
  } catch (err) {
    console.error(
      `[orders/${orderId}] wapu withdrawal create failed:`,
      err instanceof Error ? err.message : err
    );
    return; // cron retries
  }

  await db
    .update(orders)
    .set({
      wapu_withdrawal_tx_id: withdrawal.transaction_id,
      payout_status: "pending",
      updated_at: new Date(),
    })
    .where(eq(orders.id, orderId));

  if (seller.pubkey) {
    await emitNotification({
      recipient_pubkey: seller.pubkey,
      kind: "payout.pending",
      payload: { order_id: orderId, amount_ars: order.amount_ars },
    });
  }
}

/**
 * Poll the seller's withdrawal (leg 2) for the settlement cron. On
 * `Completed`: mark `payout_status = released`, stamp the time, and
 * notify the seller their ARS landed. On `Rejected`/`Canceled`: mark
 * `failed` and notify. Transient errors leave it pending for the next
 * cron tick.
 */
export async function pollWapuWithdrawal(order: OrderRow): Promise<void> {
  if (
    order.rail !== "wapu_ars" ||
    !order.wapu_withdrawal_tx_id ||
    order.payout_status !== "pending"
  ) {
    return;
  }

  const wapu = getWapuClient();
  let tx;
  try {
    tx = await wapu.getTransaction(order.wapu_withdrawal_tx_id);
  } catch (err) {
    console.warn(
      `[orders/${order.id}] wapu withdrawal poll failed:`,
      err instanceof Error ? err.message : err
    );
    return;
  }

  const db = getDb();
  if (isWapuTxComplete(tx.status)) {
    await db
      .update(orders)
      .set({
        payout_status: "released",
        payout_released_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(orders.id, order.id));
    const seller = await getUserById(order.user_id);
    if (seller?.pubkey) {
      await emitNotification({
        recipient_pubkey: seller.pubkey,
        kind: "payout.released",
        payload: { order_id: order.id, amount_ars: order.amount_ars },
      });
    }
  } else if (isWapuTxFailed(tx.status)) {
    await db
      .update(orders)
      .set({ payout_status: "failed", updated_at: new Date() })
      .where(eq(orders.id, order.id));
    const seller = await getUserById(order.user_id);
    if (seller?.pubkey) {
      await emitNotification({
        recipient_pubkey: seller.pubkey,
        kind: "payout.failed",
        payload: { order_id: order.id, amount_ars: order.amount_ars },
      });
    }
  }
}

/** Batch ceiling for one settlement sweep. */
const SETTLEMENT_BATCH = 100;

export interface SettlementSweepResult {
  /** Pending deposits polled (buyer-paid-but-left-the-page safety net). */
  polled_deposits: number;
  /** Paid orders whose seller withdrawal was (re)opened. */
  retried_withdrawals: number;
  /** Pending withdrawals polled toward release/failure. */
  polled_payouts: number;
}

/**
 * Run the three idempotent settlement passes for the wapu_ars rail:
 * confirm pending deposits, open any missing seller withdrawal, and
 * poll pending withdrawals toward settlement. Scoped to one seller
 * when `userId` is given (the on-demand "sync my orders" button),
 * otherwise sweeps every order (the daily cron). Idempotent, so the
 * cron and a manual sync can overlap safely.
 */
export async function runWapuSettlements(
  opts: { userId?: string } = {}
): Promise<SettlementSweepResult> {
  const db = getDb();
  const scope: SQL[] = opts.userId ? [eq(orders.user_id, opts.userId)] : [];

  // 1. Pending deposits (buyer left the checkout before its poller saw
  //    the confirmation).
  const pendingDeposits = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.rail, "wapu_ars"), eq(orders.status, "pending"), ...scope)
    )
    .limit(SETTLEMENT_BATCH);
  for (const order of pendingDeposits) {
    await pollWapuDeposit(order);
  }

  // 2. Paid orders whose withdrawal never opened.
  const needWithdrawal = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.rail, "wapu_ars"),
        eq(orders.status, "paid"),
        isNull(orders.payout_status),
        ...scope
      )
    )
    .limit(SETTLEMENT_BATCH);
  for (const order of needWithdrawal) {
    await openSellerWithdrawal(order.id);
  }

  // 3. Pending withdrawals awaiting fiat settlement.
  const pendingPayouts = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.rail, "wapu_ars"), eq(orders.payout_status, "pending"), ...scope)
    )
    .limit(SETTLEMENT_BATCH);
  for (const order of pendingPayouts) {
    await pollWapuWithdrawal(order);
  }

  return {
    polled_deposits: pendingDeposits.length,
    retried_withdrawals: needWithdrawal.length,
    polled_payouts: pendingPayouts.length,
  };
}
