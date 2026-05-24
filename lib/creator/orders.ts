import { and, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, offerings } from "@/lib/db/schema";
import type { OrderStatusFilter } from "@/lib/orders-params";

export interface CreatorOrderRow {
  id: string;
  status: typeof orders.$inferSelect.status;
  rail: typeof orders.$inferSelect.rail;
  payout_status: typeof orders.$inferSelect.payout_status;
  amount_ars: number;
  amount_sats: number;
  created_at: Date;
  paid_at: Date | null;
  pubkey: string | null;
  offering_title: string | null;
  offering_slug: string | null;
}

export interface CreatorOrderDetail extends CreatorOrderRow {
  payment_hash: string | null;
  wapu_deposit_tx_id: string | null;
  wapu_withdrawal_tx_id: string | null;
  redemption_code: string | null;
}

const DEFAULT_LIMIT = 50;

// Display label + colour tone for a single order, derived from the
// buyer leg (`status`), the rail, and the seller payout leg
// (`payout_status`). The returned `key` is an `orderLabel` i18n key and
// — for everything except `refunded` — is exactly the filter bucket the
// row would match in `statusFilterConditions`. `tone` maps to the
// existing `.status-{paid,pending,failed,refunded}` badge classes.
export type OrderDisplayKey =
  | "pendingPayment"
  | "withdrawalPending"
  | "settling"
  | "settled"
  | "settlementFailed"
  | "paid"
  | "failed"
  | "refunded";

export function orderDisplayStatus(o: {
  status: CreatorOrderRow["status"];
  rail: CreatorOrderRow["rail"];
  payout_status: CreatorOrderRow["payout_status"];
}): { key: OrderDisplayKey; tone: "pending" | "paid" | "failed" | "refunded" } {
  if (o.status === "pending") return { key: "pendingPayment", tone: "pending" };
  if (o.status === "failed") return { key: "failed", tone: "failed" };
  if (o.status === "refunded") return { key: "refunded", tone: "refunded" };
  // status === "paid"
  if (o.rail === "direct_lightning") return { key: "paid", tone: "paid" };
  // wapu_ars: the payout leg drives the label.
  switch (o.payout_status) {
    case "pending":
      return { key: "settling", tone: "pending" };
    case "released":
      return { key: "settled", tone: "paid" };
    case "failed":
      return { key: "settlementFailed", tone: "failed" };
    default:
      return { key: "withdrawalPending", tone: "pending" };
  }
}

// Inverse of `orderDisplayStatus`: the WHERE conditions for a compound
// status bucket. Empty array means "no constraint" (the `all` filter).
function statusFilterConditions(status: OrderStatusFilter): SQL[] {
  switch (status) {
    case "pendingPayment":
      return [eq(orders.status, "pending")];
    case "withdrawalPending":
      return [
        eq(orders.status, "paid"),
        eq(orders.rail, "wapu_ars"),
        isNull(orders.payout_status),
      ];
    case "settling":
      return [
        eq(orders.status, "paid"),
        eq(orders.rail, "wapu_ars"),
        eq(orders.payout_status, "pending"),
      ];
    case "settled":
      return [
        eq(orders.status, "paid"),
        eq(orders.rail, "wapu_ars"),
        eq(orders.payout_status, "released"),
      ];
    case "settlementFailed":
      return [
        eq(orders.status, "paid"),
        eq(orders.rail, "wapu_ars"),
        eq(orders.payout_status, "failed"),
      ];
    case "paid":
      return [eq(orders.status, "paid"), eq(orders.rail, "direct_lightning")];
    case "failed":
      return [eq(orders.status, "failed")];
    case "all":
    default:
      return [];
  }
}

// Paged seller order list, mirroring `listPurchasesPaged`: returns the
// page rows plus the total matching count so the page can render a
// pager. Filters by offering slug (the `?course=` link) and/or a
// compound status bucket, both applied server-side.
export async function listCreatorOrdersPaged(
  userId: string,
  opts: {
    offeringSlug?: string;
    status?: OrderStatusFilter;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{ rows: CreatorOrderRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? DEFAULT_LIMIT);
  const offset = (page - 1) * pageSize;

  try {
    const db = getDb();
    const conditions: SQL[] = [eq(orders.user_id, userId)];
    if (opts.offeringSlug) {
      conditions.push(eq(offerings.slug, opts.offeringSlug));
    }
    if (opts.status) {
      conditions.push(...statusFilterConditions(opts.status));
    }
    const whereClause = and(...conditions);

    const [rows, totalRaw] = await Promise.all([
      db
        .select({
          id: orders.id,
          status: orders.status,
          rail: orders.rail,
          payout_status: orders.payout_status,
          amount_ars: orders.amount_ars,
          amount_sats: orders.amount_sats,
          created_at: orders.created_at,
          paid_at: orders.paid_at,
          pubkey: orders.pubkey,
          offering_title: offerings.title,
          offering_slug: offerings.slug,
        })
        .from(orders)
        .leftJoin(offerings, eq(orders.offering_id, offerings.id))
        .where(whereClause)
        .orderBy(desc(orders.created_at))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(orders)
        .leftJoin(offerings, eq(orders.offering_id, offerings.id))
        .where(whereClause),
    ]);

    return { rows, total: totalRaw[0]?.value ?? 0 };
  } catch (err) {
    console.error("listCreatorOrdersPaged failed", err);
    return { rows: [], total: 0 };
  }
}

/**
 * Paid-order count per offering for a seller, keyed by offering id.
 * Powers the "N sales" badge on the My courses list. Offerings with
 * zero paid orders are simply absent from the map.
 */
export async function salesCountByOffering(
  userId: string
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      offering_id: orders.offering_id,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(and(eq(orders.user_id, userId), eq(orders.status, "paid")))
    .groupBy(orders.offering_id);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.offering_id, row.count);
  }
  return map;
}

export async function getCreatorOrderDetail(
  userId: string,
  orderId: string
): Promise<CreatorOrderDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: orders.id,
      status: orders.status,
      rail: orders.rail,
      payout_status: orders.payout_status,
      amount_ars: orders.amount_ars,
      amount_sats: orders.amount_sats,
      created_at: orders.created_at,
      paid_at: orders.paid_at,
      pubkey: orders.pubkey,
      payment_hash: orders.payment_hash,
      wapu_deposit_tx_id: orders.wapu_deposit_tx_id,
      wapu_withdrawal_tx_id: orders.wapu_withdrawal_tx_id,
      redemption_code: orders.redemption_code,
      offering_title: offerings.title,
      offering_slug: offerings.slug,
    })
    .from(orders)
    .leftJoin(offerings, eq(orders.offering_id, offerings.id))
    .where(and(eq(orders.id, orderId), eq(orders.user_id, userId)))
    .limit(1);
  return row ?? null;
}

export interface CreatorStudentRow {
  pubkey: string;
  order_count: number;
  total_ars: number;
  paid_count: number;
  most_recent: Date;
}

export async function listCreatorStudents(
  userId: string,
  opts: { limit?: number } = {}
): Promise<CreatorStudentRow[]> {
  const db = getDb();
  const { rows } = await db.execute<{
    pubkey: string;
    order_count: number;
    total_ars: number;
    paid_count: number;
    most_recent: string;
  }>(sql`
    SELECT
      pubkey,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(amount_ars) FILTER (WHERE status = 'paid'), 0)::int AS total_ars,
      COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count,
      MAX(created_at) AS most_recent
    FROM ${orders}
    WHERE pubkey IS NOT NULL
      AND user_id = ${userId}
    GROUP BY pubkey
    ORDER BY most_recent DESC
    LIMIT ${opts.limit ?? DEFAULT_LIMIT}
  `);
  return rows.map((r) => ({
    pubkey: r.pubkey,
    order_count: r.order_count,
    total_ars: r.total_ars,
    paid_count: r.paid_count,
    most_recent: new Date(r.most_recent),
  }));
}

export async function getCreatorStudentDetail(
  userId: string,
  pubkey: string
): Promise<{
  pubkey: string;
  order_count: number;
  total_ars: number;
  paid_count: number;
  orders: CreatorOrderRow[];
} | null> {
  const db = getDb();

  const [aggregateRow] = await db
    .select({
      count: count(),
      total_ars: sql<number>`COALESCE(SUM(${orders.amount_ars}) FILTER (WHERE ${orders.status} = 'paid'), 0)::int`,
      paid_count: sql<number>`COUNT(*) FILTER (WHERE ${orders.status} = 'paid')::int`,
    })
    .from(orders)
    .where(and(eq(orders.pubkey, pubkey), eq(orders.user_id, userId)));

  if (!aggregateRow || aggregateRow.count === 0) return null;

  const buyerOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      rail: orders.rail,
      payout_status: orders.payout_status,
      amount_ars: orders.amount_ars,
      amount_sats: orders.amount_sats,
      created_at: orders.created_at,
      paid_at: orders.paid_at,
      pubkey: orders.pubkey,
      offering_title: offerings.title,
      offering_slug: offerings.slug,
    })
    .from(orders)
    .leftJoin(offerings, eq(orders.offering_id, offerings.id))
    .where(and(eq(orders.pubkey, pubkey), eq(orders.user_id, userId)))
    .orderBy(desc(orders.created_at));

  return {
    pubkey,
    order_count: aggregateRow.count,
    total_ars: aggregateRow.total_ars,
    paid_count: aggregateRow.paid_count,
    orders: buyerOrders,
  };
}
