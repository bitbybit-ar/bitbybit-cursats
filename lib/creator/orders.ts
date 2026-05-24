import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, offerings } from "@/lib/db/schema";

export interface CreatorOrderRow {
  id: string;
  status: typeof orders.$inferSelect.status;
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
  payout_status: typeof orders.$inferSelect.payout_status;
  redemption_code: string | null;
}

const DEFAULT_LIMIT = 50;

export async function listCreatorOrders(
  userId: string,
  opts: { limit?: number; offeringSlug?: string } = {}
): Promise<CreatorOrderRow[]> {
  const db = getDb();
  const conditions = [eq(orders.user_id, userId)];
  if (opts.offeringSlug) {
    conditions.push(eq(offerings.slug, opts.offeringSlug));
  }
  return db
    .select({
      id: orders.id,
      status: orders.status,
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
    .where(and(...conditions))
    .orderBy(desc(orders.created_at))
    .limit(opts.limit ?? DEFAULT_LIMIT);
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
      amount_ars: orders.amount_ars,
      amount_sats: orders.amount_sats,
      created_at: orders.created_at,
      paid_at: orders.paid_at,
      pubkey: orders.pubkey,
      payment_hash: orders.payment_hash,
      wapu_deposit_tx_id: orders.wapu_deposit_tx_id,
      wapu_withdrawal_tx_id: orders.wapu_withdrawal_tx_id,
      payout_status: orders.payout_status,
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
