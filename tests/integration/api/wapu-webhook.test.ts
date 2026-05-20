// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { testDb, cleanDb, seedUser } from "../setup";
import { offerings } from "@/lib/db/schema";
import { createOrder, getOrder } from "@/lib/orders";
import {
  MockWapuClient,
  _resetWapuClientForTests,
  type WapuWebhookEvent,
} from "@/lib/wapu";
import {
  MockLightningClient,
  _setLightningClientForTests,
} from "@/lib/lightning";
import { POST } from "@/app/api/wapu/webhook/route";

const WEBHOOK_URL = "https://cursats.test/api/wapu/webhook";

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("WAPU_WEBHOOK_SECRET", "test-webhook-secret");
  delete process.env.WAPU_API_KEY;
  _resetWapuClientForTests();

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

  await cleanDb();
});

async function seedOrder() {
  const user = await seedUser();
  const [offering] = await testDb
    .insert(offerings)
    .values({
      user_id: user.id,
      slug: "test-offering",
      type: "code",
      title: "Test",
      description: "Test.",
      price_amount: 1000,
      price_currency: "ars" as const,
      // Non-empty pool so createOrder's sold-out guard (ADR 0019
      // follow-on) doesn't refuse the checkout before the test
      // can exercise the webhook path.
      code_pool: ["WEBHOOK-CODE-1"],
    })
    .returning();
  const result = await createOrder({
    offering_id: offering.id,
    pubkey: null,
  });
  return { offeringId: offering.id, orderId: result.order_id };
}

function buildWebhookRequest(
  body: string,
  signature: string | null
): NextRequest {
  return new NextRequest(WEBHOOK_URL, {
    method: "POST",
    headers: signature
      ? { "x-wapu-signature": signature, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/wapu/webhook — happy path", () => {
  it("verifies signature and marks the order paid", async () => {
    const { orderId } = await seedOrder();
    const order = await getOrder(orderId);
    const event: WapuWebhookEvent = {
      event_type: "direct_fiat.paid",
      tentative_uuid: order!.wapu_tentative_uuid!,
      payment_hash: order!.payment_hash!,
      occurred_at: Math.floor(Date.now() / 1000),
      amount_sats: order!.amount_sats,
      amount_ars: order!.amount_ars,
      external_id: orderId,
      settlement_ref: "wapu_ref_test",
    };

    const signer = new MockWapuClient("test-webhook-secret");
    const { rawBody, signature } = signer.signWebhookPayload(event);
    const res = await POST(buildWebhookRequest(rawBody, signature));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.updated).toBe(true);

    const after = await getOrder(orderId);
    expect(after?.status).toBe("paid");
    expect(after?.wapu_settlement_ref).toBe("wapu_ref_test");
  });
});

describe("POST /api/wapu/webhook — rejections", () => {
  it("401s when the signature header is missing", async () => {
    const res = await POST(buildWebhookRequest("{}", null));
    expect(res.status).toBe(401);
  });

  it("401s when the body has been tampered with", async () => {
    const { orderId } = await seedOrder();
    const order = await getOrder(orderId);
    const event: WapuWebhookEvent = {
      event_type: "direct_fiat.paid",
      tentative_uuid: order!.wapu_tentative_uuid!,
      payment_hash: order!.payment_hash!,
      occurred_at: Math.floor(Date.now() / 1000),
      amount_sats: order!.amount_sats,
      amount_ars: order!.amount_ars,
      external_id: orderId,
      settlement_ref: null,
    };
    const signer = new MockWapuClient("test-webhook-secret");
    const { rawBody, signature } = signer.signWebhookPayload(event);
    const tamperedBody = rawBody.replace(
      /direct_fiat\.paid/,
      "direct_fiat.failed"
    );
    const res = await POST(buildWebhookRequest(tamperedBody, signature));
    expect(res.status).toBe(401);
  });

  it("400s when the payload schema is invalid (signature passes but body shape doesn't)", async () => {
    const { createHmac } = await import("node:crypto");
    const rawBody = JSON.stringify({ totally: "wrong" });
    const authentic = createHmac("sha256", "test-webhook-secret")
      .update(rawBody, "utf8")
      .digest("base64");
    const res = await POST(buildWebhookRequest(rawBody, authentic));
    expect(res.status).toBe(400);
  });

  it("ignores unknown order ids with 200 to stop Wapu retries", async () => {
    const event: WapuWebhookEvent = {
      event_type: "direct_fiat.paid",
      tentative_uuid: "ghost",
      payment_hash: "a".repeat(64),
      occurred_at: Math.floor(Date.now() / 1000),
      amount_sats: 100,
      amount_ars: 25,
      external_id: "00000000-0000-0000-0000-000000000000",
      settlement_ref: null,
    };
    const signer = new MockWapuClient("test-webhook-secret");
    const { rawBody, signature } = signer.signWebhookPayload(event);
    const res = await POST(buildWebhookRequest(rawBody, signature));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("unknown_order");
  });

  it("returns 200 with ignored=expired/failed events without touching the row", async () => {
    const { orderId } = await seedOrder();
    const event: WapuWebhookEvent = {
      event_type: "direct_fiat.expired",
      tentative_uuid: "x",
      payment_hash: "a".repeat(64),
      occurred_at: Math.floor(Date.now() / 1000),
      amount_sats: 0,
      amount_ars: 0,
      external_id: orderId,
      settlement_ref: null,
    };
    const signer = new MockWapuClient("test-webhook-secret");
    const { rawBody, signature } = signer.signWebhookPayload(event);
    const res = await POST(buildWebhookRequest(rawBody, signature));
    expect(res.status).toBe(200);
    const after = await getOrder(orderId);
    expect(after?.status).toBe("pending");
  });
});

// Rail guard (ADR 0015). A Wapu-shaped webhook arriving for a
// direct_lightning order must be refused — the verify-URL polling
// path is responsible for that rail; letting Wapu flip the row
// would create a payment-confirmation oracle for an unrelated
// settlement track.
describe("POST /api/wapu/webhook — rail guard (direct_lightning)", () => {
  it("404s when the order's rail is direct_lightning, leaving the row pending", async () => {
    // getLightningClient() now always returns RealLightningClient,
    // which would fail on the synthetic `alice@strike.me` address
    // below. Inject the mock so createOrder mints deterministically.
    _setLightningClientForTests(new MockLightningClient());

    const user = await seedUser({
      // Switch rail to LN; createOrder will stamp the new order
      // with rail=direct_lightning.
      payout_method: "lightning_address",
      lightning_address: "alice@strike.me",
      cbu: null,
      alias: null,
    });
    const [offering] = await testDb
      .insert(offerings)
      .values({
        user_id: user.id,
        slug: "ln-offering",
        type: "code",
        title: "LN Course",
        description: "via lightning",
        price_amount: 1000,
        price_currency: "ars" as const,
        code_pool: ["LN-CODE-1"],
      })
      .returning();
    const result = await createOrder({
      offering_id: offering.id,
      pubkey: null,
    });
    const order = await getOrder(result.order_id);
    expect(order?.rail).toBe("direct_lightning");

    // Hand-craft a valid Wapu webhook for this order id.
    const event: WapuWebhookEvent = {
      event_type: "direct_fiat.paid",
      tentative_uuid: "should-not-match",
      payment_hash: order!.payment_hash!,
      occurred_at: Math.floor(Date.now() / 1000),
      amount_sats: order!.amount_sats,
      amount_ars: order!.amount_ars,
      external_id: result.order_id,
      settlement_ref: "wapu_should_not_settle_this",
    };
    const signer = new MockWapuClient("test-webhook-secret");
    const { rawBody, signature } = signer.signWebhookPayload(event);
    const res = await POST(buildWebhookRequest(rawBody, signature));

    expect(res.status).toBe(404);
    // 404 has no body — confirm we did not surface the order's
    // existence in the response.
    expect(await res.text()).toBe("");

    // Order must still be pending. A bug here would mean Wapu can
    // mark sats-rail orders paid without the seller's wallet
    // ever receiving the funds.
    const after = await getOrder(result.order_id);
    expect(after?.status).toBe("pending");
    expect(after?.paid_at).toBeNull();
    expect(after?.wapu_settlement_ref).toBeNull();
  });
});
