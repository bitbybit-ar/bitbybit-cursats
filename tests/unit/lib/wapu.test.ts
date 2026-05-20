// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  MockWapuClient,
  getWapuClient,
  _resetWapuClientForTests,
  type WapuWebhookEvent,
} from "@/lib/wapu";

describe("MockWapuClient/createDirectPayment + funding", () => {
  it("creates a tentative and issues funding instructions", async () => {
    const client = new MockWapuClient();
    const tentative = await client.createDirectPayment({
      amount_ars: 28000,
      alias: "demo.test.alias",
      receiver_name: "Demo Profe",
      external_id: "order-123",
    });
    expect(tentative.uuid).toMatch(/^mock_dp_/);
    expect(tentative.status).toBe("CREATED");

    const funding = await client.issueDirectPaymentFunding(tentative.uuid);
    expect(funding.amount_ars).toBe(28000);
    expect(funding.amount_sats).toBeGreaterThan(0);
    expect(funding.bolt11).toMatch(/^lnbc\d+n1mock/);
    expect(funding.payment_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(funding.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("issues unique tentative uuids and payment hashes", async () => {
    const client = new MockWapuClient();
    const a = await client.createDirectPayment({
      amount_ars: 1000,
      alias: "demo.test.alias",
      receiver_name: "Demo",
      external_id: "1",
    });
    const b = await client.createDirectPayment({
      amount_ars: 1000,
      alias: "demo.test.alias",
      receiver_name: "Demo",
      external_id: "2",
    });
    expect(a.uuid).not.toBe(b.uuid);
    const fundingA = await client.issueDirectPaymentFunding(a.uuid);
    const fundingB = await client.issueDirectPaymentFunding(b.uuid);
    expect(fundingA.payment_hash).not.toBe(fundingB.payment_hash);
  });

  it("rejects funding for an unknown tentative", async () => {
    const client = new MockWapuClient();
    await expect(
      client.issueDirectPaymentFunding("does-not-exist")
    ).rejects.toThrow(/mock_tentative_not_found/);
  });
});

describe("MockWapuClient/getTentative", () => {
  it("always reports pending so the test must drive payment via webhook", async () => {
    const client = new MockWapuClient();
    const state = await client.getTentative("anything");
    expect(state.status).toBe("pending");
    expect(state.paid_at).toBeNull();
  });
});

describe("MockWapuClient webhook signing/verification", () => {
  const event: WapuWebhookEvent = {
    event_type: "direct_fiat.paid",
    tentative_uuid: "mock_dp_abc",
    payment_hash: "a".repeat(64),
    occurred_at: 1_700_000_000,
    amount_sats: 4_000,
    amount_ars: 1_000,
    external_id: "order-1",
    settlement_ref: "wapu_settle_1",
  };

  it("round-trips a signed payload", () => {
    const client = new MockWapuClient("test-secret");
    const { rawBody, signature } = client.signWebhookPayload(event);
    expect(client.verifyWebhookSignature(rawBody, signature)).toBe(true);
  });

  it("rejects a tampered body with the original signature", () => {
    const client = new MockWapuClient("test-secret");
    const { rawBody, signature } = client.signWebhookPayload(event);
    const tampered = rawBody.replace(/order-1/, "order-2");
    expect(client.verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const client = new MockWapuClient("test-secret");
    const { rawBody } = client.signWebhookPayload(event);
    expect(client.verifyWebhookSignature(rawBody, null)).toBe(false);
  });

  it("rejects a signature signed with a different secret", () => {
    const sender = new MockWapuClient("attacker-secret");
    const receiver = new MockWapuClient("real-secret");
    const { rawBody, signature } = sender.signWebhookPayload(event);
    expect(receiver.verifyWebhookSignature(rawBody, signature)).toBe(false);
  });

  it("rejects junk in the signature header", () => {
    const client = new MockWapuClient("test-secret");
    const { rawBody } = client.signWebhookPayload(event);
    expect(client.verifyWebhookSignature(rawBody, "not-base64!!")).toBe(false);
    expect(client.verifyWebhookSignature(rawBody, "")).toBe(false);
  });
});

describe("getWapuClient factory", () => {
  beforeEach(() => {
    _resetWapuClientForTests();
    delete process.env.WAPU_API_KEY;
  });

  it("returns the mock when WAPU_API_KEY is unset", () => {
    const client = getWapuClient();
    expect(client).toBeInstanceOf(MockWapuClient);
  });

  it("returns the same instance on repeated calls", () => {
    const a = getWapuClient();
    const b = getWapuClient();
    expect(a).toBe(b);
  });

  it("returns the unimplemented real client when WAPU_API_KEY is set", async () => {
    process.env.WAPU_API_KEY = "real-key";
    const client = getWapuClient();
    expect(client).not.toBeInstanceOf(MockWapuClient);
    await expect(
      client.createDirectPayment({
        amount_ars: 100,
        alias: "demo.test.alias",
        receiver_name: "Demo",
        external_id: "y",
      })
    ).rejects.toThrow(/not implemented/);
  });
});
