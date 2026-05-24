import { and, eq, desc, ilike, lt, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, offerings, users } from "@/lib/db/schema";
import { getWapuClient } from "@/lib/wapu";
import {
  getLightningClient,
  LightningMintError,
  type LightningMintErrorCode,
} from "@/lib/lightning";
import { mintNwcInvoice, NwcError, type NwcErrorCode } from "@/lib/nwc";
import { decrypt } from "@/lib/crypto";
import { pickPayoutAlias } from "@/lib/creator/users";
import { convertPrice } from "@/lib/exchange-rate";

export interface CreateOrderInput {
  offering_id: string;
  /** Hex pubkey from a logged-in session, or pasted at checkout. Null = anonymous. */
  pubkey: string | null;
}

/**
 * Funding instructions returned by createOrder. Rail-agnostic — the
 * checkout UI only needs bolt11, amounts, and a TTL hint. The ARS
 * amount is always present (always priced in pesos for display); it
 * is settled-in only for `wapu_ars` orders. payment_hash rides along
 * for callers (tests, debugging) that want to assert on the on-row
 * identifier; the public /api/checkout response strips it.
 */
export interface OrderFunding {
  bolt11: string;
  amount_sats: number;
  amount_ars: number;
  expires_at: number;
  payment_hash: string;
}

export interface CreateOrderResult {
  order_id: string;
  funding: OrderFunding;
}

export type CreateOrderError =
  | "offering_not_found"
  | "offering_archived"
  | "offering_sold_out"
  | "seller_inactive"
  | "seller_payout_missing"
  | "seller_lightning_address_missing"
  | "lightning_mint_failed"
  | "seller_nwc_missing"
  | "nwc_mint_failed";

export class OrderCreateError extends Error {
  constructor(
    public readonly code: CreateOrderError,
    /**
     * When `code === "lightning_mint_failed"`, the underlying
     * LightningMintError code rides along so the checkout API can
     * surface a specific reason (lnurl_unreachable vs lnurl_no_lud21
     * vs …) to the buyer instead of a generic "unavailable". Unset
     * for non-LN failure modes. `nwc_code` is the NWC analogue, set
     * when `code === "nwc_mint_failed"` (ADR 0029).
     */
    public readonly lightning_code?: LightningMintErrorCode,
    public readonly nwc_code?: NwcErrorCode
  ) {
    super(code);
    this.name = "OrderCreateError";
  }
}

// Sats/ARS quotes come from `lib/exchange-rate.ts` so the dev
// fallback and the future live Wapu rate share a single seam.

/**
 * Atomically create a pending order row and the matching funding
 * instructions. The order id is the opaque `orderId` that powers
 * the receipt URL `/[locale]/receipt/[orderId]`.
 *
 * Two rails (ADR 0015):
 *
 *   - seller.payout_method = 'cbu_alias' (default) → Wapu mints a
 *     BOLT11 against the seller's bank alias/CBU and settles ARS
 *     to the seller after the buyer pays.
 *   - seller.payout_method = 'lightning_address' → lib/lightning
 *     resolves the seller's LN address, mints a BOLT11 directly,
 *     and the seller's wallet receives the sats. No Wapu, no ARS.
 *     The order's `lnurl_verify_url` powers the status poller.
 *   - seller.payout_method = 'lightning_nwc' → lib/nwc mints a BOLT11
 *     against the seller's wallet over NWC (NIP-47); the seller's
 *     wallet receives the sats. No Wapu, no ARS, and no
 *     `lnurl_verify_url` — the poller confirms via NWC lookup_invoice
 *     on the order's `payment_hash`. ADR 0029.
 *
 * Both sats methods ride the `direct_lightning` order rail. Failed
 * checkouts delete the pending row before throwing so we do not leave
 * orphans polluting any dashboard.
 */
export async function createOrder(
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const db = getDb();

  const [row] = await db
    .select({ offering: offerings, seller: users })
    .from(offerings)
    .innerJoin(users, eq(offerings.user_id, users.id))
    .where(eq(offerings.id, input.offering_id))
    .limit(1);

  if (!row) throw new OrderCreateError("offering_not_found");
  const { offering, seller } = row;
  if (offering.archived_at !== null) {
    throw new OrderCreateError("offering_archived");
  }
  if (!seller.active) throw new OrderCreateError("seller_inactive");
  // Code offerings are sold out when the pool is empty. Pre-checkout
  // refusal avoids charging buyers for codes we cannot deliver. The
  // pool itself remains the source of truth — sellers re-open the
  // course by minting more codes from /my-courses/[slug]/edit. The
  // optimistic pop in `drawAndAssignCode` is still in place for the
  // narrow race where two buyers check out the last code at once;
  // the loser of that race lands in the receipt's "code pending"
  // branch and is the seller's manual problem.
  if (offering.type === "code" && (offering.code_pool?.length ?? 0) === 0) {
    throw new OrderCreateError("offering_sold_out");
  }

  // Snapshot the ARS price at checkout time. The Wapu rail needs ARS
  // upstream; the direct-Lightning rail records ARS for the buyer's
  // receipt. Either way we lock the rate at the moment of order
  // creation so a rate move mid-flight cannot re-price the order.
  const lockedArs =
    offering.price_currency === "ars"
      ? offering.price_amount
      : await convertPrice(offering.price_amount, "sats", "ars");

  // Insert the order first so we have an external_id to give upstream.
  // Stamp the rail at insert time from the seller's current
  // payout_method — flipping the rail later does not retroactively
  // rewrite an in-flight order.
  const [pendingRow] = await db
    .insert(orders)
    .values({
      pubkey: input.pubkey,
      offering_id: offering.id,
      user_id: seller.id,
      amount_ars: lockedArs,
      amount_sats: 0,
      rail:
        seller.payout_method === "cbu_alias" ? "wapu_ars" : "direct_lightning",
    })
    .returning();

  try {
    if (seller.payout_method === "lightning_address") {
      const funding = await fundDirectLightningOrder({
        order_id: pendingRow.id,
        offering_title: offering.title,
        offering_price_amount: offering.price_amount,
        offering_price_currency: offering.price_currency,
        locked_ars: lockedArs,
        lightning_address: seller.lightning_address,
      });
      return { order_id: pendingRow.id, funding };
    }
    if (seller.payout_method === "lightning_nwc") {
      const funding = await fundNwcOrder({
        order_id: pendingRow.id,
        offering_title: offering.title,
        offering_price_amount: offering.price_amount,
        offering_price_currency: offering.price_currency,
        locked_ars: lockedArs,
        nwc_uri: seller.nwc_uri,
      });
      return { order_id: pendingRow.id, funding };
    }
    const funding = await fundWapuOrder({
      order_id: pendingRow.id,
      amount_ars: lockedArs,
      seller,
    });
    return { order_id: pendingRow.id, funding };
  } catch (err) {
    await db.delete(orders).where(eq(orders.id, pendingRow.id));
    throw err;
  }
}

async function fundWapuOrder(opts: {
  order_id: string;
  amount_ars: number;
  seller: typeof users.$inferSelect;
}): Promise<OrderFunding> {
  const db = getDb();
  const payoutAlias = pickPayoutAlias(opts.seller);
  if (!payoutAlias) throw new OrderCreateError("seller_payout_missing");

  // Leg 1 of the wapu_ars rail: mint a Lightning deposit the buyer
  // pays. The sats credit USDT to our Wapu wallet; the seller's ARS
  // withdrawal (leg 2) is opened only after the deposit confirms —
  // see `pollWapuDeposit` in lib/wapu-settlement.ts.
  //
  // We size the deposit from the ARS price at the current rate.
  // OPEN DECISION: the Wapu withdrawal fee and any rate drift between
  // deposit and withdrawal are absorbed by the platform float in v1.
  // If sellers should net the fee instead, size/withdraw differently.
  const amount_sats = await convertPrice(opts.amount_ars, "ars", "sats");

  const wapu = getWapuClient();
  const deposit = await wapu.createLightningDeposit(amount_sats);

  await db
    .update(orders)
    .set({
      amount_sats: deposit.amount_sats,
      wapu_deposit_tx_id: deposit.transaction_id,
      bolt11: deposit.bolt11,
      transfer_speed: opts.seller.transfer_speed,
      updated_at: new Date(),
    })
    .where(eq(orders.id, opts.order_id));

  return {
    bolt11: deposit.bolt11,
    amount_sats: deposit.amount_sats,
    amount_ars: opts.amount_ars,
    expires_at: deposit.expires_at,
    // Wapu deposits don't expose a separate payment hash; the order
    // is correlated by wapu_deposit_tx_id, not the hash.
    payment_hash: "",
  };
}

async function fundDirectLightningOrder(opts: {
  order_id: string;
  offering_title: string;
  offering_price_amount: number;
  offering_price_currency: "ars" | "sats";
  locked_ars: number;
  lightning_address: string | null;
}): Promise<OrderFunding> {
  const db = getDb();
  if (!opts.lightning_address) {
    throw new OrderCreateError("seller_lightning_address_missing");
  }
  const amount_sats =
    opts.offering_price_currency === "sats"
      ? opts.offering_price_amount
      : await convertPrice(opts.offering_price_amount, "ars", "sats");
  const ln = getLightningClient();
  let invoice;
  try {
    invoice = await ln.mintInvoice(
      opts.lightning_address,
      amount_sats,
      opts.offering_title
    );
  } catch (err) {
    if (err instanceof LightningMintError) {
      throw new OrderCreateError("lightning_mint_failed", err.code);
    }
    throw err;
  }

  await db
    .update(orders)
    .set({
      amount_sats: invoice.amount_sats,
      payment_hash: invoice.payment_hash,
      bolt11: invoice.bolt11,
      lnurl_verify_url: invoice.verify_url,
      updated_at: new Date(),
    })
    .where(eq(orders.id, opts.order_id));

  return {
    bolt11: invoice.bolt11,
    amount_sats: invoice.amount_sats,
    amount_ars: opts.locked_ars,
    expires_at: invoice.expires_at,
    payment_hash: invoice.payment_hash,
  };
}

/**
 * Fund a `lightning_nwc` order (ADR 0029): mint a BOLT11 against the
 * seller's wallet over NWC. Sats land in the seller's wallet, same as
 * the LN-address path. Unlike that path there is no `lnurl_verify_url`
 * — the poller confirms via NWC lookup_invoice on `payment_hash`, and
 * the absence of `lnurl_verify_url` is what marks the order as NWC.
 */
async function fundNwcOrder(opts: {
  order_id: string;
  offering_title: string;
  offering_price_amount: number;
  offering_price_currency: "ars" | "sats";
  locked_ars: number;
  nwc_uri: string | null;
}): Promise<OrderFunding> {
  const db = getDb();
  if (!opts.nwc_uri) {
    throw new OrderCreateError("seller_nwc_missing");
  }
  const amount_sats =
    opts.offering_price_currency === "sats"
      ? opts.offering_price_amount
      : await convertPrice(opts.offering_price_amount, "ars", "sats");
  // The stored URI is encrypted at rest — decrypt only here, on the
  // server, to talk to the seller's wallet.
  const uri = decrypt(opts.nwc_uri);
  let invoice;
  try {
    invoice = await mintNwcInvoice(uri, amount_sats, opts.offering_title);
  } catch (err) {
    if (err instanceof NwcError) {
      throw new OrderCreateError("nwc_mint_failed", undefined, err.code);
    }
    throw err;
  }

  await db
    .update(orders)
    .set({
      amount_sats: invoice.amount_sats,
      payment_hash: invoice.payment_hash,
      bolt11: invoice.bolt11,
      // No lnurl_verify_url: that null is the NWC discriminator the
      // status poller keys on (schema comment on orders).
      updated_at: new Date(),
    })
    .where(eq(orders.id, opts.order_id));

  return {
    bolt11: invoice.bolt11,
    amount_sats: invoice.amount_sats,
    amount_ars: opts.locked_ars,
    expires_at: invoice.expires_at,
    payment_hash: invoice.payment_hash,
  };
}

/**
 * Claim one download slot on a paid `download` order. Atomic: the
 * conditional `download_count < max` lives in the UPDATE's WHERE, so
 * two concurrent fetches at the cap boundary can never both succeed
 * (the second matches no row). Returns the post-increment count when a
 * slot was claimed, or `{ ok: false }` when the order is already at the
 * cap. The download proxy calls this last, after every other access
 * check, so a 404/400 never burns a slot.
 */
export async function tryConsumeDownload(
  orderId: string,
  max: number
): Promise<{ ok: true; count: number } | { ok: false }> {
  const db = getDb();
  const [row] = await db
    .update(orders)
    .set({
      download_count: sql`${orders.download_count} + 1`,
      updated_at: new Date(),
    })
    .where(and(eq(orders.id, orderId), lt(orders.download_count, max)))
    .returning({ count: orders.download_count });
  return row ? { ok: true, count: row.count } : { ok: false };
}

/**
 * Idempotent transition of the buyer leg to `paid`. The status
 * poller may race itself across overlapping requests, and the
 * settlement cron may retry; this guard makes any second call a
 * no-op. Rail-agnostic.
 *
 * `amount_usdt` is the USDT credited to our Wapu wallet by the
 * confirmed deposit (wapu_ars only); pass null/undefined for
 * direct_lightning.
 */
export async function markOrderPaid(opts: {
  order_id: string;
  amount_usdt?: number | null;
  paid_at: Date;
}): Promise<{ updated: boolean }> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, opts.order_id))
    .limit(1);

  if (!existing) {
    throw new Error(`Order ${opts.order_id} not found`);
  }
  if (existing.status === "paid") {
    return { updated: false };
  }

  await db
    .update(orders)
    .set({
      status: "paid",
      paid_at: opts.paid_at,
      amount_usdt:
        opts.amount_usdt != null
          ? String(opts.amount_usdt)
          : existing.amount_usdt,
      updated_at: new Date(),
    })
    .where(eq(orders.id, opts.order_id));
  return { updated: true };
}

/**
 * Idempotent transition of the buyer leg to `failed` (the deposit
 * expired or Wapu reported it Rejected/Canceled). Only flips a
 * `pending` order; a no-op otherwise so a late poll can't undo a
 * paid order.
 */
export async function markOrderFailed(opts: {
  order_id: string;
}): Promise<{ updated: boolean }> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, opts.order_id))
    .limit(1);

  if (!existing) {
    throw new Error(`Order ${opts.order_id} not found`);
  }
  if (existing.status !== "pending") {
    return { updated: false };
  }

  await db
    .update(orders)
    .set({ status: "failed", updated_at: new Date() })
    .where(eq(orders.id, opts.order_id));
  return { updated: true };
}

export async function getOrder(orderId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return row ?? null;
}

/**
 * Most recent *paid* order for a given buyer + offering, or null.
 * Powers the course detail page's "Go to receipt" / "Buy again"
 * split (issue #35): a signed-in buyer who already owns the offering
 * gets a receipt link alongside the repeat-purchase button. Pending
 * and failed orders are ignored — a receipt only exists once paid.
 */
export async function getOrderByPubkeyAndOffering(
  pubkey: string,
  offeringId: string
): Promise<typeof orders.$inferSelect | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.pubkey, pubkey),
        eq(orders.offering_id, offeringId),
        eq(orders.status, "paid")
      )
    )
    .orderBy(desc(orders.created_at))
    .limit(1);
  return row ?? null;
}

/**
 * History query for /[locale]/purchases. Cursor is the
 * `created_at` of the last row from the previous page; pass null
 * for the first page.
 */
export async function listOrdersByPubkey(
  pubkey: string,
  limit = 20
): Promise<Array<typeof orders.$inferSelect>> {
  const db = getDb();
  return db
    .select()
    .from(orders)
    .where(eq(orders.pubkey, pubkey))
    .orderBy(desc(orders.created_at))
    .limit(limit);
}

/**
 * Paged history view for `/purchases`. Joins offering + seller once
 * (instead of N round-trips to `getOfferingById` per row) so the
 * page can render a richer row (thumbnail, seller byline, status)
 * without scaling cost in proportion to the order list.
 *
 * Filters:
 *   * `status`: `undefined` → all; otherwise a single
 *     `orders.status` value.
 *   * `q`: matches offering title OR seller display name (ILIKE,
 *     metacharacters escaped). Mirrors the discovery search's
 *     buyer-recognisable axes.
 *
 * Returns rows in `created_at DESC` order plus the total filtered
 * count for the pager.
 */
export type PurchasedOrder = typeof orders.$inferSelect;
export interface PurchaseRow {
  order: PurchasedOrder;
  offering: {
    id: string;
    slug: string;
    title: string;
    image_url: string | null;
    type: typeof offerings.$inferSelect.type;
  };
  seller: {
    slug: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface ListPurchasesPagedOpts {
  pubkey: string;
  status?: PurchasedOrder["status"];
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listPurchasesPaged(
  opts: ListPurchasesPagedOpts
): Promise<{ rows: PurchaseRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 12);
  const offset = (page - 1) * pageSize;
  const q = opts.q?.trim();

  try {
    const db = getDb();
    const conditions: SQL[] = [eq(orders.pubkey, opts.pubkey)];
    if (opts.status) conditions.push(eq(orders.status, opts.status));
    if (q) {
      // Escape LIKE metacharacters so a literal `%` doesn't wildcard.
      const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const search = sql`(${ilike(offerings.title, pattern)} OR ${ilike(
        users.display_name,
        pattern
      )})`;
      conditions.push(search);
    }
    const whereClause = and(...conditions);

    const [rowsRaw, totalRaw] = await Promise.all([
      db
        .select({
          order: orders,
          offering_id: offerings.id,
          offering_slug: offerings.slug,
          offering_title: offerings.title,
          offering_image_url: offerings.image_url,
          offering_type: offerings.type,
          seller_slug: users.slug,
          seller_display_name: users.display_name,
          seller_avatar_url: users.avatar_url,
        })
        .from(orders)
        .innerJoin(offerings, eq(orders.offering_id, offerings.id))
        .innerJoin(users, eq(offerings.user_id, users.id))
        .where(whereClause)
        .orderBy(desc(orders.created_at))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(orders)
        .innerJoin(offerings, eq(orders.offering_id, offerings.id))
        .innerJoin(users, eq(offerings.user_id, users.id))
        .where(whereClause),
    ]);

    const rows: PurchaseRow[] = rowsRaw.map((r) => ({
      order: r.order,
      offering: {
        id: r.offering_id,
        slug: r.offering_slug,
        title: r.offering_title,
        image_url: r.offering_image_url,
        type: r.offering_type,
      },
      seller: {
        slug: r.seller_slug,
        display_name: r.seller_display_name,
        avatar_url: r.seller_avatar_url,
      },
    }));

    return { rows, total: totalRaw[0].value };
  } catch (err) {
    console.error("listPurchasesPaged failed", err);
    return { rows: [], total: 0 };
  }
}

export type ClaimOrderResult =
  | { status: "claimed"; order: typeof orders.$inferSelect }
  | { status: "already_yours"; order: typeof orders.$inferSelect }
  | { status: "already_claimed" }
  | { status: "not_found" };

/**
 * Attach an anonymous order to a logged-in buyer's pubkey. Used by
 * `/api/orders/[orderId]/claim` (called from
 * `/[locale]/claim/[orderId]`). The opaque orderId from the receipt URL is the
 * access key; if the buyer can name it, they own it. Decision in
 * ADR 0007.
 *
 * Idempotent on `already_yours` so a buyer who clicks "claim"
 * twice gets a benign success rather than a confusing error.
 * `already_claimed` (the order belongs to a *different* pubkey) is
 * the conflict case the route handler maps to a 409.
 */
export async function claimOrderForBuyer(opts: {
  order_id: string;
  pubkey: string;
}): Promise<ClaimOrderResult> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, opts.order_id))
    .limit(1);

  if (!existing) return { status: "not_found" };
  if (existing.pubkey === opts.pubkey) {
    return { status: "already_yours", order: existing };
  }
  if (existing.pubkey !== null) {
    return { status: "already_claimed" };
  }

  const [updated] = await db
    .update(orders)
    .set({ pubkey: opts.pubkey, updated_at: new Date() })
    .where(eq(orders.id, opts.order_id))
    .returning();
  return { status: "claimed", order: updated };
}

export type RedemptionDrawResult =
  | { status: "assigned"; code: string }
  | { status: "pool_empty" }
  | { status: "not_a_code_offering" }
  | { status: "already_assigned"; code: string };

const DRAW_MAX_ATTEMPTS = 5;

/**
 * Pop a redemption code from `offerings.code_pool` and assign it to
 * `orders.redemption_code`. Called from the Wapu webhook handler
 * after the order transitions to `paid`.
 *
 * Concurrency
 *   neon-http does not support interactive transactions, so we
 *   serialise via optimistic concurrency: the UPDATE on offerings
 *   matches the chosen first-of-pool value, and a racing webhook
 *   that picked the same value sees zero rows updated and retries.
 *   With a 5-attempt cap, simultaneous webhooks for distinct
 *   orders against the same offering converge to distinct codes
 *   even under high concurrency.
 *
 * Idempotency
 *   If the order already has a `redemption_code` (a previous draw
 *   succeeded; the webhook fired again), returns `already_assigned`
 *   without consuming another code from the pool.
 */
export async function drawAndAssignCode(opts: {
  order_id: string;
}): Promise<RedemptionDrawResult> {
  const db = getDb();

  for (let attempt = 0; attempt < DRAW_MAX_ATTEMPTS; attempt++) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, opts.order_id))
      .limit(1);
    if (!order) throw new Error(`Order ${opts.order_id} not found`);
    if (order.redemption_code) {
      return { status: "already_assigned", code: order.redemption_code };
    }

    const [offering] = await db
      .select()
      .from(offerings)
      .where(eq(offerings.id, order.offering_id))
      .limit(1);
    if (!offering) {
      throw new Error(`Offering ${order.offering_id} not found`);
    }
    if (offering.type !== "code") {
      return { status: "not_a_code_offering" };
    }

    const pool = offering.code_pool ?? [];
    if (pool.length === 0) {
      return { status: "pool_empty" };
    }

    const candidate = pool[0];
    const remaining = pool.slice(1);

    // Optimistic pop: only succeed if the pool's first element is
    // still the candidate we picked. A racing webhook that chose
    // the same candidate gets zero rows updated and falls into the
    // next loop iteration, which re-reads the (now-shrunken) pool.
    const popResult = await db
      .update(offerings)
      .set({ code_pool: remaining, updated_at: new Date() })
      .where(
        and(
          eq(offerings.id, offering.id),
          sql`${offerings.code_pool}[1] = ${candidate}`
        )
      )
      .returning({ id: offerings.id });

    if (popResult.length === 0) {
      // Another writer popped this candidate; retry with fresh state.
      continue;
    }

    await db
      .update(orders)
      .set({ redemption_code: candidate, updated_at: new Date() })
      .where(eq(orders.id, opts.order_id));

    return { status: "assigned", code: candidate };
  }

  // Exhausted retries — caller should log + return 500 so Wapu
  // re-delivers the webhook. This should be vanishingly rare in
  // practice; loud failure beats silently dropping the assignment.
  throw new Error(
    `drawAndAssignCode exhausted ${DRAW_MAX_ATTEMPTS} attempts for order ${opts.order_id}`
  );
}
