// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import { testDb, cleanDb, seedUser } from "../setup";
import { offerings, orders } from "@/lib/db/schema";
import {
  createOrder,
  markOrderPaid,
  markOrderFailed,
  failExpiredOrder,
  failExpiredOrders,
  getOrder,
  getOrderByPubkeyAndOffering,
  listOrdersByPubkey,
  claimOrderForBuyer,
  drawAndAssignCode,
} from "@/lib/orders";
import {
  MockLightningClient,
  _setLightningClientForTests,
} from "@/lib/lightning";
import { getWapuClient, _resetWapuClientForTests } from "@/lib/wapu";

// There is no Wapu mock: createOrder on the wapu_ars rail mints a real
// Lightning deposit invoice against staging. The real-connection test
// runs only when staging creds are present in .env.test.
const HAS_WAPU = Boolean(
  process.env.WAPU_API_KEY && process.env.WAPU_PAY_APU_HOST
);

beforeAll(async () => {
  const { rows } = await testDb.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'offerings'
    ) AS "exists"
  `);
  if (!rows[0]?.exists) {
    throw new Error(
      "Test database is missing the 'offerings' table. Run `npm run test:db:migrate` first."
    );
  }
});

beforeEach(async () => {
  await cleanDb();
  // The seedUser helper is per-test; the cached id from the
  // previous test points at a row that cleanDb just truncated.
  testUserId = "";
});

let testUserId: string;

async function ensureTestUser() {
  if (!testUserId) {
    const m = await seedUser();
    testUserId = m.id;
  }
  return testUserId;
}

async function seedOffering(slug = "bono-4-clases") {
  const userId = await ensureTestUser();
  const [row] = await testDb
    .insert(offerings)
    .values({
      user_id: userId,
      slug,
      type: "code",
      title: "Bono 4 clases",
      description: "Cuatro clases.",
      price_amount: 28000,
      price_currency: "ars" as const,
      image_url: "https://example.com/cover.png",
      // createOrder refuses to take a checkout against a code
      // offering with an empty pool (ADR 0019 follow-on). Seed
      // some codes so the order-creation tests can exercise the
      // post-pool-check code paths.
      code_pool: ["TEST-AAAA", "TEST-BBBB", "TEST-CCCC"],
    })
    .returning();
  return row;
}

// Insert a pending wapu_ars order row directly, bypassing createOrder's
// Wapu funding network call. The lifecycle functions under test
// (markOrderPaid, claimOrderForBuyer, drawAndAssignCode,
// listOrdersByPubkey) operate on existing rows and don't care how the
// row was funded — so seeding the row directly keeps them offline and
// fast. There is no Wapu mock to fund through; createOrder's real
// funding is proven by the gated real-staging test above.
async function seedPendingOrder(
  offering: { id: string; user_id: string; price_amount: number },
  opts: {
    pubkey?: string | null;
    createdAt?: Date;
    expiresAt?: Date | null;
  } = {}
): Promise<{ order_id: string }> {
  const values: typeof orders.$inferInsert = {
    pubkey: opts.pubkey ?? null,
    offering_id: offering.id,
    user_id: offering.user_id,
    amount_ars: offering.price_amount,
    amount_sats: 0,
    rail: "wapu_ars",
  };
  if (opts.createdAt) values.created_at = opts.createdAt;
  if (opts.expiresAt !== undefined) values.expires_at = opts.expiresAt;
  const [row] = await testDb.insert(orders).values(values).returning();
  return { order_id: row.id };
}

const HEX_PUBKEY = "a".repeat(64);

describe("orders/createOrder", () => {
  // Real Wapu staging: createOrder must mint a genuine Lightning
  // deposit invoice, and reading that transaction straight back from
  // Wapu must report it Pending (nobody paid the invoice). This is the
  // end-to-end proof that leg 1 talks to the live rail; it runs only
  // when staging creds are present (skipped in credential-less CI).
  it.skipIf(!HAS_WAPU)(
    "creates an order against real Wapu staging and getTransaction reports it Pending",
    async () => {
      _resetWapuClientForTests(); // build the live client from env
      const offering = await seedOffering();
      const result = await createOrder({
        offering_id: offering.id,
        pubkey: HEX_PUBKEY,
      });
      expect(result.funding.amount_ars).toBe(28000);
      expect(result.funding.bolt11).toMatch(/^lnbc/);

      const row = await getOrder(result.order_id);
      expect(row?.pubkey).toBe(HEX_PUBKEY);
      expect(row?.status).toBe("pending");
      expect(row?.rail).toBe("wapu_ars");
      expect(row?.amount_ars).toBe(28000);
      expect(row?.amount_sats).toBe(result.funding.amount_sats);
      // Leg 1 stamps the deposit tx id; the withdrawal opens later.
      expect(row?.wapu_deposit_tx_id).toBeTruthy();
      expect(row?.wapu_withdrawal_tx_id).toBeNull();
      expect(row?.payout_status).toBeNull();

      // Read the deposit back from Wapu staging by id — our integration
      // worked if the live rail reports it Pending. Whether Wapu then
      // settles it is Wapu's side and is not asserted.
      const tx = await getWapuClient().getTransaction(row!.wapu_deposit_tx_id!);
      expect(tx.transaction_id).toBe(row!.wapu_deposit_tx_id);
      expect(tx.status).toBe("Pending");
      expect(tx.bolt11).toMatch(/^lnbc/);
    }
  );

  it("rejects a checkout against a non-existent offering", async () => {
    await expect(
      createOrder({
        offering_id: "00000000-0000-0000-0000-000000000000",
        pubkey: null,
      })
    ).rejects.toMatchObject({ code: "offering_not_found" });
  });

  it("rejects a checkout against an archived offering", async () => {
    const offering = await seedOffering("archived");
    await testDb
      .update(offerings)
      .set({ archived_at: new Date() })
      .where(eq(offerings.id, offering.id));

    await expect(
      createOrder({ offering_id: offering.id, pubkey: null })
    ).rejects.toMatchObject({ code: "offering_archived" });
  });
});

// Sats settlement rail (ADR 0015). When the seller's
// payout_method is 'lightning_address', createOrder mints via the
// LightningClient instead of Wapu, stamps rail=direct_lightning,
// and persists the LUD-21 verify URL.
describe("orders/createOrder — direct_lightning rail", () => {
  it("dispatches to lib/lightning when user.payout_method is lightning_address", async () => {
    _setLightningClientForTests(new MockLightningClient());

    // Seed an LN-rail user (separate slug + pubkey from the
    // default seedUser so we don't collide with prior tests in
    // this describe block).
    const user = await seedUser({
      pubkey: "a".repeat(64),
      slug: "ln-seller",
      payout_method: "lightning_address",
      lightning_address: "alice@strike.me",
      alias: null,
      cbu: null,
    });
    testUserId = user.id;
    const offering = await seedOffering("ln-only");

    const result = await createOrder({
      offering_id: offering.id,
      pubkey: null,
    });

    const row = await getOrder(result.order_id);
    expect(row?.rail).toBe("direct_lightning");
    expect(row?.bolt11).toMatch(/^lnbc/);
    expect(row?.payment_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.lnurl_verify_url).toMatch(/^https:\/\/mock\.lnurl\/verify\//);
    // Wapu fields stay null on this rail.
    expect(row?.wapu_deposit_tx_id).toBeNull();
    expect(row?.wapu_withdrawal_tx_id).toBeNull();
    // The invoice's expiry is persisted (issue #57): the MockLightning
    // client mints a 10-minute TTL, so expires_at lands ~600s out.
    expect(row?.expires_at).toBeTruthy();
    const ttlSec = (row!.expires_at!.getTime() - Date.now()) / 1000;
    expect(ttlSec).toBeGreaterThan(540);
    expect(ttlSec).toBeLessThanOrEqual(600);
  });

  it("rejects with seller_lightning_address_missing when sats rail is set but the address is null", async () => {
    _setLightningClientForTests(new MockLightningClient());
    const user = await seedUser({
      pubkey: "b".repeat(64),
      slug: "ln-no-address",
      payout_method: "lightning_address",
      lightning_address: null,
      alias: null,
      cbu: null,
    });
    testUserId = user.id;
    const offering = await seedOffering("orphan");

    await expect(
      createOrder({ offering_id: offering.id, pubkey: null })
    ).rejects.toMatchObject({ code: "seller_lightning_address_missing" });
  });

  it("surfaces a LightningMintError as lightning_mint_failed (e.g. provider with no LUD-21)", async () => {
    _setLightningClientForTests(new MockLightningClient());
    const user = await seedUser({
      pubkey: "c".repeat(64),
      slug: "ln-bad-provider",
      payout_method: "lightning_address",
      // The mock rejects this exact address with lnurl_no_lud21.
      lightning_address: "nolud21@example.invalid",
      alias: null,
      cbu: null,
    });
    testUserId = user.id;
    const offering = await seedOffering("nolud21");

    await expect(
      createOrder({ offering_id: offering.id, pubkey: null })
    ).rejects.toMatchObject({
      code: "lightning_mint_failed",
      // The underlying LightningMintErrorCode rides along so the
      // checkout API can surface a specific buyer-facing message.
      lightning_code: "lnurl_no_lud21",
    });

    // The pending row should have been deleted on failure (createOrder
    // catches the throw, deletes, then rethrows).
    const remaining = await testDb
      .select()
      .from(orders)
      .where(eq(orders.user_id, user.id));
    expect(remaining).toHaveLength(0);
  });
});

describe("orders/markOrderPaid", () => {
  it("transitions pending → paid and stamps paid_at + USDT credited", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering);
    const before = await getOrder(order_id);
    expect(before?.status).toBe("pending");

    const paidAt = new Date();
    const result = await markOrderPaid({
      order_id,
      amount_usdt: 19.23,
      paid_at: paidAt,
    });

    expect(result.updated).toBe(true);
    const after = await getOrder(order_id);
    expect(after?.status).toBe("paid");
    expect(after?.paid_at?.getTime()).toBeCloseTo(paidAt.getTime(), -3);
    expect(Number(after?.amount_usdt)).toBeCloseTo(19.23, 2);
  });

  it("is idempotent — second call returns updated=false and does not overwrite paid_at", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering);

    const firstPaidAt = new Date(2026, 0, 1);
    await markOrderPaid({
      order_id,
      amount_usdt: 10,
      paid_at: firstPaidAt,
    });
    const second = await markOrderPaid({
      order_id,
      amount_usdt: 99,
      paid_at: new Date(2026, 5, 1),
    });

    expect(second.updated).toBe(false);
    const after = await getOrder(order_id);
    expect(Number(after?.amount_usdt)).toBeCloseTo(10, 2);
    expect(after?.paid_at?.getTime()).toBe(firstPaidAt.getTime());
  });
});

const PAST = () => new Date(Date.now() - 60_000);
const FUTURE = () => new Date(Date.now() + 60_000);

describe("orders/failExpiredOrder", () => {
  it("flips a pending order whose expiry has passed", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering, {
      expiresAt: PAST(),
    });
    const result = await failExpiredOrder(order_id);
    expect(result.updated).toBe(true);
    expect((await getOrder(order_id))?.status).toBe("failed");
  });

  it("is a no-op for a pending order that has not expired yet", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering, {
      expiresAt: FUTURE(),
    });
    const result = await failExpiredOrder(order_id);
    expect(result.updated).toBe(false);
    expect((await getOrder(order_id))?.status).toBe("pending");
  });

  it("is a no-op when expires_at is null (legacy row)", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering, { expiresAt: null });
    const result = await failExpiredOrder(order_id);
    expect(result.updated).toBe(false);
    expect((await getOrder(order_id))?.status).toBe("pending");
  });

  it("never touches a paid order, even past expiry", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering, {
      expiresAt: PAST(),
    });
    await markOrderPaid({ order_id, paid_at: new Date() });
    const result = await failExpiredOrder(order_id);
    expect(result.updated).toBe(false);
    expect((await getOrder(order_id))?.status).toBe("paid");
  });

  it("is idempotent on an already-failed order", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering, {
      expiresAt: PAST(),
    });
    await markOrderFailed({ order_id });
    const second = await failExpiredOrder(order_id);
    expect(second.updated).toBe(false);
    expect((await getOrder(order_id))?.status).toBe("failed");
  });
});

describe("orders/failExpiredOrders (bulk)", () => {
  it("fails only the buyer's expired pending orders, scoped by pubkey", async () => {
    const offering = await seedOffering();
    const expired = await seedPendingOrder(offering, {
      pubkey: HEX_PUBKEY,
      expiresAt: PAST(),
    });
    const live = await seedPendingOrder(offering, {
      pubkey: HEX_PUBKEY,
      expiresAt: FUTURE(),
    });
    // A different buyer's expired order must be left untouched.
    const other = await seedPendingOrder(offering, {
      pubkey: "b".repeat(64),
      expiresAt: PAST(),
    });

    const result = await failExpiredOrders({ pubkey: HEX_PUBKEY });
    expect(result.updated).toBe(1);
    expect((await getOrder(expired.order_id))?.status).toBe("failed");
    expect((await getOrder(live.order_id))?.status).toBe("pending");
    expect((await getOrder(other.order_id))?.status).toBe("pending");
  });

  it("fails the seller's expired pending orders, scoped by userId", async () => {
    const offering = await seedOffering();
    const expired = await seedPendingOrder(offering, { expiresAt: PAST() });
    const live = await seedPendingOrder(offering, { expiresAt: FUTURE() });

    const result = await failExpiredOrders({ userId: offering.user_id });
    expect(result.updated).toBe(1);
    expect((await getOrder(expired.order_id))?.status).toBe("failed");
    expect((await getOrder(live.order_id))?.status).toBe("pending");
  });
});

describe("orders/listOrdersByPubkey", () => {
  it("returns the buyer's orders, newest first", async () => {
    const offering = await seedOffering();
    // Explicit timestamps so the created_at DESC ordering is
    // deterministic regardless of how fast the inserts run.
    const a = await seedPendingOrder(offering, {
      pubkey: HEX_PUBKEY,
      createdAt: new Date(2026, 0, 1),
    });
    const b = await seedPendingOrder(offering, {
      pubkey: HEX_PUBKEY,
      createdAt: new Date(2026, 0, 2),
    });
    const list = await listOrdersByPubkey(HEX_PUBKEY);
    expect(list.length).toBe(2);
    expect(list.map((o) => o.id)).toEqual([b.order_id, a.order_id]);
  });

  it("does not return anonymous orders or other buyers' orders", async () => {
    const offering = await seedOffering();
    await seedPendingOrder(offering, { pubkey: null });
    await seedPendingOrder(offering, { pubkey: "b".repeat(64) });
    const list = await listOrdersByPubkey(HEX_PUBKEY);
    expect(list.length).toBe(0);
  });
});

describe("orders/getOrderByPubkeyAndOffering", () => {
  // Seed a paid order with an explicit created_at so the
  // "most recent" ordering is deterministic.
  async function seedPaidOrder(
    offering: { id: string; user_id: string; price_amount: number },
    opts: { pubkey: string; createdAt: Date }
  ): Promise<{ order_id: string }> {
    const { order_id } = await seedPendingOrder(offering, opts);
    await markOrderPaid({ order_id, paid_at: opts.createdAt });
    return { order_id };
  }

  it("returns the most recent paid order for the buyer + offering", async () => {
    const offering = await seedOffering();
    await seedPaidOrder(offering, {
      pubkey: HEX_PUBKEY,
      createdAt: new Date(2026, 0, 1),
    });
    const newer = await seedPaidOrder(offering, {
      pubkey: HEX_PUBKEY,
      createdAt: new Date(2026, 0, 2),
    });

    const found = await getOrderByPubkeyAndOffering(HEX_PUBKEY, offering.id);
    expect(found?.id).toBe(newer.order_id);
  });

  it("returns null when the buyer only has a pending order", async () => {
    const offering = await seedOffering();
    await seedPendingOrder(offering, { pubkey: HEX_PUBKEY });

    const found = await getOrderByPubkeyAndOffering(HEX_PUBKEY, offering.id);
    expect(found).toBeNull();
  });

  it("ignores other buyers, other offerings, and anonymous orders", async () => {
    const offering = await seedOffering();
    const otherOffering = await seedOffering("otro-curso");
    // Different buyer, same offering.
    await seedPaidOrder(offering, {
      pubkey: "b".repeat(64),
      createdAt: new Date(2026, 0, 1),
    });
    // Same buyer, different offering.
    await seedPaidOrder(otherOffering, {
      pubkey: HEX_PUBKEY,
      createdAt: new Date(2026, 0, 1),
    });
    // Anonymous paid order on the target offering.
    const anon = await seedPendingOrder(offering, { pubkey: null });
    await markOrderPaid({ order_id: anon.order_id, paid_at: new Date() });

    const found = await getOrderByPubkeyAndOffering(HEX_PUBKEY, offering.id);
    expect(found).toBeNull();
  });
});

describe("orders/claimOrderForBuyer", () => {
  const OTHER_PUBKEY = "b".repeat(64);

  it("attaches an anonymous order to the buyer pubkey", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering);
    const result = await claimOrderForBuyer({
      order_id,
      pubkey: HEX_PUBKEY,
    });
    expect(result.status).toBe("claimed");
    if (result.status === "claimed") {
      expect(result.order.pubkey).toBe(HEX_PUBKEY);
    }
    const reread = await getOrder(order_id);
    expect(reread?.pubkey).toBe(HEX_PUBKEY);
  });

  it("is idempotent when the order already belongs to the same buyer", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering, {
      pubkey: HEX_PUBKEY,
    });
    const result = await claimOrderForBuyer({
      order_id,
      pubkey: HEX_PUBKEY,
    });
    expect(result.status).toBe("already_yours");
  });

  it("refuses to overwrite an order that belongs to a different pubkey", async () => {
    const offering = await seedOffering();
    const { order_id } = await seedPendingOrder(offering, {
      pubkey: OTHER_PUBKEY,
    });
    const result = await claimOrderForBuyer({
      order_id,
      pubkey: HEX_PUBKEY,
    });
    expect(result.status).toBe("already_claimed");
    const reread = await getOrder(order_id);
    expect(reread?.pubkey).toBe(OTHER_PUBKEY);
  });

  it("returns not_found for an unknown order id", async () => {
    const result = await claimOrderForBuyer({
      order_id: "00000000-0000-0000-0000-000000000000",
      pubkey: HEX_PUBKEY,
    });
    expect(result.status).toBe("not_found");
  });
});

describe("orders/drawAndAssignCode", () => {
  async function seedCodeOfferingWithPool(codes: string[]) {
    const userId = await ensureTestUser();
    const [row] = await testDb
      .insert(offerings)
      .values({
        user_id: userId,
        slug: `pool-${codes.length}-${Date.now()}`,
        type: "code",
        title: "Pool offering",
        description: "Has a pool.",
        price_amount: 1000,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        code_pool: codes,
      })
      .returning();
    return row;
  }

  async function seedDownloadOffering() {
    const userId = await ensureTestUser();
    const [row] = await testDb
      .insert(offerings)
      .values({
        user_id: userId,
        slug: `download-${Date.now()}`,
        type: "download",
        title: "PDF",
        description: "A download.",
        price_amount: 500,
        price_currency: "ars" as const,

        image_url: "https://example.com/cover.png",
        download_url: "https://example.com/pdf",
      })
      .returning();
    return row;
  }

  it("pops the first code from the pool and assigns it to the order", async () => {
    const offering = await seedCodeOfferingWithPool([
      "CODE-A",
      "CODE-B",
      "CODE-C",
    ]);
    const { order_id } = await seedPendingOrder(offering);

    const result = await drawAndAssignCode({ order_id });

    expect(result.status).toBe("assigned");
    if (result.status === "assigned") {
      expect(result.code).toBe("CODE-A");
    }
    const order = await getOrder(order_id);
    expect(order?.redemption_code).toBe("CODE-A");

    const [updatedOffering] = await testDb
      .select()
      .from(offerings)
      .where(eq(offerings.id, offering.id))
      .limit(1);
    expect(updatedOffering.code_pool).toEqual(["CODE-B", "CODE-C"]);
  });

  it("is idempotent on repeat delivery — does not consume a second code", async () => {
    const offering = await seedCodeOfferingWithPool(["ONE", "TWO"]);
    const { order_id } = await seedPendingOrder(offering);

    const first = await drawAndAssignCode({ order_id });
    expect(first.status).toBe("assigned");
    const second = await drawAndAssignCode({ order_id });
    expect(second.status).toBe("already_assigned");
    if (second.status === "already_assigned") {
      expect(second.code).toBe("ONE");
    }

    const [updatedOffering] = await testDb
      .select()
      .from(offerings)
      .where(eq(offerings.id, offering.id))
      .limit(1);
    expect(updatedOffering.code_pool).toEqual(["TWO"]);
  });

  it("returns pool_empty when there is nothing to draw", async () => {
    // Simulates the race where two buyers claim the last code at
    // once — one wins the pop, the other lands on `pool_empty`.
    // createOrder's pre-checkout sold-out guard (ADR 0019 follow-
    // on) refuses checkout against an empty pool, so we can't
    // reach this code path through the normal seed flow. Instead
    // we seed the offering WITH a code, create the order, then
    // drop the pool by hand before calling drawAndAssignCode.
    const offering = await seedCodeOfferingWithPool(["TRANSIENT"]);
    const { order_id } = await seedPendingOrder(offering);
    await testDb
      .update(offerings)
      .set({ code_pool: [] })
      .where(eq(offerings.id, offering.id));
    const result = await drawAndAssignCode({ order_id });
    expect(result.status).toBe("pool_empty");
    const order = await getOrder(order_id);
    expect(order?.redemption_code).toBeNull();
  });

  it("returns not_a_code_offering for download offerings", async () => {
    const offering = await seedDownloadOffering();
    const { order_id } = await seedPendingOrder(offering);
    const result = await drawAndAssignCode({ order_id });
    expect(result.status).toBe("not_a_code_offering");
    const order = await getOrder(order_id);
    expect(order?.redemption_code).toBeNull();
  });

  it("assigns distinct codes to distinct orders racing the same pool", async () => {
    // Smoke test for the optimistic-concurrency loop: kick off two
    // draws against the same offering in parallel; both must land
    // on different codes and the pool must shrink by exactly two.
    const offering = await seedCodeOfferingWithPool(["X1", "X2", "X3"]);
    const a = await seedPendingOrder(offering);
    const b = await seedPendingOrder(offering);

    const [resA, resB] = await Promise.all([
      drawAndAssignCode({ order_id: a.order_id }),
      drawAndAssignCode({ order_id: b.order_id }),
    ]);

    expect(resA.status).toBe("assigned");
    expect(resB.status).toBe("assigned");
    if (resA.status === "assigned" && resB.status === "assigned") {
      expect(resA.code).not.toBe(resB.code);
      expect(["X1", "X2"]).toContain(resA.code);
      expect(["X1", "X2"]).toContain(resB.code);
    }

    const [updated] = await testDb
      .select()
      .from(offerings)
      .where(eq(offerings.id, offering.id))
      .limit(1);
    expect(updated.code_pool).toEqual(["X3"]);
  });
});
