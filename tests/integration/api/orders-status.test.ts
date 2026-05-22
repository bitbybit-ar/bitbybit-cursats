// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { testDb, cleanDb, seedUser } from "../setup";
import { offerings } from "@/lib/db/schema";
import { createOrder, getOrder } from "@/lib/orders";
import {
  MockLightningClient,
  _setLightningClientForTests,
} from "@/lib/lightning";
import { GET } from "@/app/api/orders/[orderId]/route";

const ORDER_URL = "https://cursats.test/api/orders/abc";

beforeEach(async () => {
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
  await cleanDb();
});

async function seedLightningOrder() {
  const ln = new MockLightningClient();
  _setLightningClientForTests(ln);
  const user = await seedUser({
    pubkey: "a".repeat(64),
    slug: "ln-status-test",
    payout_method: "lightning_address",
    lightning_address: "alice@strike.me",
    alias: null,
    cbu: null,
  });
  const [offering] = await testDb
    .insert(offerings)
    .values({
      user_id: user.id,
      slug: "ln-offering",
      type: "code",
      title: "Status test",
      description: "for the polling path",
      price_amount: 1000,
      price_currency: "ars" as const,
      // Pre-seed one redemption code so drawAndAssignCode succeeds
      // without `pool_empty`.
      code_pool: ["TEST-CODE-1"],
    })
    .returning();
  const result = await createOrder({
    offering_id: offering.id,
    pubkey: null,
  });
  return { ln, user, offering, orderId: result.order_id };
}

function buildStatusRequest(): NextRequest {
  return new NextRequest(ORDER_URL, { method: "GET" });
}

describe("GET /api/orders/[orderId] — direct_lightning rail", () => {
  it("returns pending until the LUD-21 verify URL flips settled", async () => {
    const { orderId } = await seedLightningOrder();

    const res = await GET(buildStatusRequest(), {
      params: Promise.resolve({ orderId }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      order_id: orderId,
      status: "pending",
    });

    // Row was not mutated.
    const after = await getOrder(orderId);
    expect(after?.status).toBe("pending");
    expect(after?.paid_at).toBeNull();
  });

  it("flips the row to paid + assigns a code on settle", async () => {
    const { ln, orderId } = await seedLightningOrder();

    const before = await getOrder(orderId);
    ln.markPaid(before!.lnurl_verify_url!);

    const res = await GET(buildStatusRequest(), {
      params: Promise.resolve({ orderId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("paid");
    expect(json.paid_at).toEqual(expect.any(String));

    const after = await getOrder(orderId);
    expect(after?.status).toBe("paid");
    expect(after?.paid_at).not.toBeNull();
    expect(after?.redemption_code).toBe("TEST-CODE-1");
    // No Wapu withdrawal on the LN rail.
    expect(after?.wapu_withdrawal_tx_id).toBeNull();
    expect(after?.payout_status).toBeNull();
  });

  it("subsequent calls after settle return the cached paid status", async () => {
    const { ln, orderId } = await seedLightningOrder();
    const before = await getOrder(orderId);
    ln.markPaid(before!.lnurl_verify_url!);

    const first = await GET(buildStatusRequest(), {
      params: Promise.resolve({ orderId }),
    });
    expect((await first.json()).status).toBe("paid");

    const second = await GET(buildStatusRequest(), {
      params: Promise.resolve({ orderId }),
    });
    expect((await second.json()).status).toBe("paid");

    // Code wasn't drawn twice; no race-condition errors.
    const after = await getOrder(orderId);
    expect(after?.redemption_code).toBe("TEST-CODE-1");
  });

  it("404s when the order id is unknown", async () => {
    const res = await GET(buildStatusRequest(), {
      params: Promise.resolve({
        orderId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });
});

// The wapu_ars deposit→paid→withdrawal transition can't be driven
// against a live wallet (settling is Wapu's side), so it is not
// asserted here. The create→invoice→Pending integration is covered by
// the gated real-staging test in tests/integration/lib/orders.test.ts;
// markOrderPaid's buyer-paid effects are covered in orders.test.ts.
