import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, offerings } from "@/lib/db/schema";

export interface AdminOverviewStats {
  /** Total ARS settled this calendar month (paid orders only). */
  revenueArsMtd: number;
  /** Count of orders in `pending` state right now. */
  pendingCount: number;
  /** Count of orders that flipped to `paid` in the last 30 days. */
  paidLast30: number;
  /** Most recent N orders, regardless of status. */
  recent: Array<RecentOrderRow>;
}

export interface RecentOrderRow {
  id: string;
  status: typeof orders.$inferSelect.status;
  amount_ars: number;
  amount_sats: number;
  created_at: Date;
  paid_at: Date | null;
  pubkey: string | null;
  offering_title: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function getAdminOverview(
  userId: string
): Promise<AdminOverviewStats> {
  const db = getDb();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);

  // Three small COUNTs/SUMs in parallel, all scoped to this user
  // (ADRs 0012, 0016). Queries stay small enough that a join
  // helper is overkill.
  const [revenueRow, pendingRow, paidRow, recentRows] = await Promise.all([
    db
      .select({
        sum: sql<number>`COALESCE(SUM(${orders.amount_ars}), 0)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.user_id, userId),
          eq(orders.status, "paid"),
          gte(orders.paid_at, monthStart)
        )
      ),
    db
      .select({ count: count() })
      .from(orders)
      .where(and(eq(orders.user_id, userId), eq(orders.status, "pending"))),
    db
      .select({ count: count() })
      .from(orders)
      .where(
        and(
          eq(orders.user_id, userId),
          eq(orders.status, "paid"),
          gte(orders.paid_at, thirtyDaysAgo)
        )
      ),
    db
      .select({
        id: orders.id,
        status: orders.status,
        amount_ars: orders.amount_ars,
        amount_sats: orders.amount_sats,
        created_at: orders.created_at,
        paid_at: orders.paid_at,
        pubkey: orders.pubkey,
        offering_title: offerings.title,
      })
      .from(orders)
      .leftJoin(offerings, eq(orders.offering_id, offerings.id))
      .where(eq(orders.user_id, userId))
      .orderBy(desc(orders.created_at))
      .limit(10),
  ]);

  return {
    revenueArsMtd: revenueRow[0]?.sum ?? 0,
    pendingCount: pendingRow[0]?.count ?? 0,
    paidLast30: paidRow[0]?.count ?? 0,
    recent: recentRows,
  };
}
