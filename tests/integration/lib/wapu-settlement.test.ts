// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import { testDb, cleanDb, seedUser } from "../setup";
import { offerings, orders } from "@/lib/db/schema";
import {
  openSellerWithdrawal,
  pollWapuWithdrawal,
  runWapuSettlements,
} from "@/lib/wapu-settlement";
import {
  _setWapuClientForTests,
  _resetWapuClientForTests,
  type WapuClient,
  type WapuTransaction,
  type WapuTxStatus,
  type CreateWithdrawalRequest,
  type WithdrawalResult,
  type TentativeAmount,
} from "@/lib/wapu";

// The wapu_ars seller payout leg is the money-out path. Its defining
// safety property is idempotency: a deposit can confirm via the buyer's
// poller AND the settlement cron, and the cron itself can run twice, so
// openSellerWithdrawal must open *exactly one* withdrawal per order. A
// regression here means a double payout. There is no Wapu mock in the
// app (ADR 0025), so these tests inject a deterministic fake via the
// test-only seam and seed order rows directly.

const ACTOR = "f".repeat(64);

/**
 * A fake Wapu client that records every withdrawal it is asked to open
 * and reports a configurable transaction status. Only the three methods
 * the settlement path calls are implemented.
 */
function makeFakeWapu(opts: { txStatus?: WapuTxStatus } = {}) {
  const withdrawals: CreateWithdrawalRequest[] = [];
  let counter = 0;
  const client = {
    async tentativeAmount(): Promise<TentativeAmount> {
      // fee 0.5 USDT @ 1000 ARS/USDT → 500 ARS fee.
      return { exchange_rate: 1000, fee: 0.5, total_amount: 0, usdt_amount: 0 };
    },
    async createWithdrawal(
      req: CreateWithdrawalRequest
    ): Promise<WithdrawalResult> {
      withdrawals.push(req);
      counter += 1;
      return { transaction_id: `wd_${counter}`, status: "Pending" };
    },
    async getTransaction(transaction_id: string): Promise<WapuTransaction> {
      return {
        transaction_id,
        status: opts.txStatus ?? "Pending",
        type: "withdrawal",
        payment_amount: 0,
        payment_currency: "ARS",
        currency_taken: "USDT",
        total_amount_taken: 0,
        fee_taken: 0,
        current_rate: 1000,
        bolt11: null,
        verify_url: null,
        expires_at: null,
        alias: null,
        receiver_name: null,
      };
    },
  } as unknown as WapuClient;
  return { client, withdrawals };
}

async function seedPaidOrder(
  overrides: Partial<typeof orders.$inferInsert> = {}
) {
  const user = await seedUser({ pubkey: ACTOR }); // alias + cbu_alias rail
  const [offering] = await testDb
    .insert(offerings)
    .values({
      user_id: user.id,
      slug: "bono-4-clases",
      type: "code",
      title: "Bono 4 clases",
      description: "Cuatro clases.",
      price_amount: 28000,
      price_currency: "ars" as const,
      image_url: "https://example.com/cover.png",
      code_pool: ["TEST-AAAA"],
    })
    .returning();
  const [order] = await testDb
    .insert(orders)
    .values({
      offering_id: offering.id,
      user_id: user.id,
      amount_ars: 28000,
      amount_sats: 0,
      rail: "wapu_ars",
      status: "paid",
      transfer_speed: "fiat_transfer",
      paid_at: new Date(),
      ...overrides,
    })
    .returning();
  return { user, offering, order };
}

async function reload(id: string) {
  const [row] = await testDb.select().from(orders).where(eq(orders.id, id));
  return row;
}

beforeAll(async () => {
  const { rows } = await testDb.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'orders'
    ) AS "exists"
  `);
  if (!rows[0]?.exists) {
    throw new Error(
      "Test database is missing the 'orders' table. Run `npm run test:db:migrate` first."
    );
  }
});

beforeEach(async () => {
  await cleanDb();
});

afterEach(() => {
  _resetWapuClientForTests();
});

describe("openSellerWithdrawal", () => {
  it("opens one withdrawal for the net payout and stamps the order", async () => {
    const { withdrawals, client } = makeFakeWapu();
    _setWapuClientForTests(client);
    const { order, user } = await seedPaidOrder();

    await openSellerWithdrawal(order.id);

    expect(withdrawals).toHaveLength(1);
    // Seller bears the fee: net = 28000 − round(0.5 × 1000) = 27500.
    expect(withdrawals[0].payment_amount_ars).toBe(27500);
    expect(withdrawals[0].alias).toBe("demo.test.alias");
    expect(withdrawals[0].receiver_name).toBe(user.display_name);

    const row = await reload(order.id);
    expect(row.wapu_withdrawal_tx_id).toBe("wd_1");
    expect(row.payout_status).toBe("pending");
  });

  it("is idempotent: a second call does not open a second withdrawal", async () => {
    const { withdrawals, client } = makeFakeWapu();
    _setWapuClientForTests(client);
    const { order } = await seedPaidOrder();

    await openSellerWithdrawal(order.id);
    await openSellerWithdrawal(order.id);

    expect(withdrawals).toHaveLength(1);
    const row = await reload(order.id);
    expect(row.wapu_withdrawal_tx_id).toBe("wd_1");
  });

  it("is a no-op for an order that is not yet paid", async () => {
    const { withdrawals, client } = makeFakeWapu();
    _setWapuClientForTests(client);
    const { order } = await seedPaidOrder({ status: "pending", paid_at: null });

    await openSellerWithdrawal(order.id);

    expect(withdrawals).toHaveLength(0);
    const row = await reload(order.id);
    expect(row.payout_status).toBeNull();
  });

  it("is a no-op when a withdrawal id is already recorded", async () => {
    const { withdrawals, client } = makeFakeWapu();
    _setWapuClientForTests(client);
    const { order } = await seedPaidOrder({
      wapu_withdrawal_tx_id: "wd_existing",
      payout_status: "pending",
    });

    await openSellerWithdrawal(order.id);

    expect(withdrawals).toHaveLength(0);
  });
});

describe("runWapuSettlements", () => {
  it("opens a withdrawal for a paid order and a re-sweep does not re-open it", async () => {
    const { withdrawals, client } = makeFakeWapu(); // getTransaction → Pending
    _setWapuClientForTests(client);
    const { order } = await seedPaidOrder();

    const first = await runWapuSettlements();
    expect(first.retried_withdrawals).toBe(1);
    expect(withdrawals).toHaveLength(1);

    // Second sweep: pass 2 finds no null-payout paid orders, and pass 3
    // polls the still-Pending withdrawal without re-opening it.
    const second = await runWapuSettlements();
    expect(second.retried_withdrawals).toBe(0);
    expect(withdrawals).toHaveLength(1);

    const row = await reload(order.id);
    expect(row.wapu_withdrawal_tx_id).toBe("wd_1");
    expect(row.payout_status).toBe("pending");
  });
});

describe("pollWapuWithdrawal", () => {
  it("marks the payout released when Wapu reports the withdrawal Completed", async () => {
    const { client } = makeFakeWapu({ txStatus: "Completed" });
    _setWapuClientForTests(client);
    const { order } = await seedPaidOrder({
      wapu_withdrawal_tx_id: "wd_settled",
      payout_status: "pending",
    });

    await pollWapuWithdrawal(await reload(order.id));

    const row = await reload(order.id);
    expect(row.payout_status).toBe("released");
    expect(row.payout_released_at).not.toBeNull();
  });

  it("marks the payout failed when Wapu reports the withdrawal Rejected", async () => {
    const { client } = makeFakeWapu({ txStatus: "Rejected" });
    _setWapuClientForTests(client);
    const { order } = await seedPaidOrder({
      wapu_withdrawal_tx_id: "wd_rejected",
      payout_status: "pending",
    });

    await pollWapuWithdrawal(await reload(order.id));

    const row = await reload(order.id);
    expect(row.payout_status).toBe("failed");
  });
});
