import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { getSatsPerArs } from "@/lib/exchange-rate";

/**
 * Wapu integration seam (marketplace edition, ADR 0012).
 *
 * The buyer flow talks to Wapu through the WapuClient interface
 * defined below. Two implementations live in this file:
 *
 *   - MockWapuClient: deterministic, in-process, no network. Used
 *     in dev and tests so the whole buyer flow runs end-to-end
 *     without any Wapu credentials.
 *   - UnimplementedWapuClient: throws clearly until the real
 *     direct-payment endpoint is wired through to a live Wapu
 *     account.
 *
 * `getWapuClient()` returns the mock when WAPU_API_KEY is unset
 * (default for dev and CI) and the real client otherwise.
 *
 * Direct-payment shape (per `wapu-app/wapu-cli#7`):
 *   - POST /transactions/direct-fiat/tentatives
 *       body { amount_ars, type, alias, receiver_name,
 *              funding_method, network }
 *       → { uuid, status: "CREATED" }
 *   - POST /transactions/direct-fiat/tentatives/{uuid}/funding
 *       body {}
 *       → funding instructions (BOLT11 invoice + amount + expiry)
 *
 * The webhook signature scheme below (HMAC-SHA256 of raw body
 * with WAPU_WEBHOOK_SECRET, base64-encoded, sent in
 * `X-Wapu-Signature`) is a placeholder matching the pattern most
 * webhook providers use. TODO(Q1): when Wapu publishes the
 * direct-payment settlement-event shape, swap the verifier and
 * `WapuWebhookEvent` accordingly.
 */

// --- Direct-payment types ----------------------------------------

/** Funding rails Wapu accepts; we only use LIGHTNING in v1. */
export type WapuFundingMethod = "LIGHTNING" | "USDT";
export type WapuFundingNetwork = "LIGHTNING" | "POLYGON";
export type WapuTransferType = "fiat_transfer" | "fast_fiat_transfer";

export interface CreateDirectPaymentRequest {
  amount_ars: number;
  /**
   * Argentine bank alias OR 22-digit CBU. Wapu accepts both via
   * the same `alias` field per the CLI (validated by us before
   * we get here — see `lib/admin/ar-bank-id.ts`).
   */
  alias: string;
  /** Seller's display name; appears on the buyer's Wapu receipt. */
  receiver_name: string;
  type?: WapuTransferType;
  funding_method?: WapuFundingMethod;
  network?: WapuFundingNetwork;
  /** Internal order id we want correlated back in the webhook. */
  external_id: string;
}

export interface DirectPaymentTentative {
  /** UUID Wapu issued. Stored on orders.wapu_tentative_uuid. */
  uuid: string;
  status: string;
}

export interface DirectPaymentFunding {
  /** BOLT11-encoded Lightning invoice the buyer pays. */
  bolt11: string;
  /** 32-byte payment hash, hex-encoded. */
  payment_hash: string;
  /** Amount the buyer will be charged, in sats. */
  amount_sats: number;
  /** Amount Wapu will settle to the seller, in whole pesos. */
  amount_ars: number;
  /** Unix seconds. */
  expires_at: number;
}

export type WapuTentativeStatus = "pending" | "paid" | "expired" | "failed";

export interface WapuTentativeState {
  uuid: string;
  status: WapuTentativeStatus;
  payment_hash: string;
  paid_at: number | null;
  /** Wapu's reference for the ARS settlement to the seller's CBU. */
  settlement_ref: string | null;
}

/**
 * Webhook event shape. v1 mirrors the prior invoice-based vocabulary
 * (paid / expired / failed) but keys on `tentative_uuid` instead of
 * `invoice_id`. TODO(Q1): confirm against the real Wapu direct-
 * payment settlement webhook once the contract is shared.
 */
export interface WapuWebhookEvent {
  event_type: "direct_fiat.paid" | "direct_fiat.expired" | "direct_fiat.failed";
  tentative_uuid: string;
  payment_hash: string;
  /** Unix seconds. */
  occurred_at: number;
  amount_sats: number;
  amount_ars: number;
  external_id: string;
  settlement_ref: string | null;
}

export interface WapuClient {
  createDirectPayment(
    req: CreateDirectPaymentRequest
  ): Promise<DirectPaymentTentative>;
  issueDirectPaymentFunding(
    tentative_uuid: string
  ): Promise<DirectPaymentFunding>;
  getTentative(tentative_uuid: string): Promise<WapuTentativeState>;
  /**
   * Verify a webhook delivery. Returns true iff the signature
   * matches the body under the configured secret. Implementations
   * MUST use a constant-time comparison.
   */
  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | null
  ): boolean;
}

// --- Mock ---------------------------------------------------------

/**
 * Deterministic mock used by dev and tests. The sats amount is
 * derived from the shared `getSatsPerArs()` seam (ADR 0022) — the
 * same rate the storefront's PriceTag uses — so in dev/demo the
 * buyer's "≈ X sats" matches what the mock actually charges at
 * funding. The rate is snapshotted at `createDirectPayment` and
 * reused at funding so it can't drift between the two calls. The
 * BOLT11 payload is a non-routable placeholder (clients will
 * recognise it as not real and refuse to pay it — intentional), and
 * getTentative always reports `pending` so the only way to mark an
 * order paid is to deliver a webhook via the test helpers.
 */
const MOCK_TENTATIVE_TTL_SECONDS = 600;

interface StoredTentative {
  amount_ars: number;
  amount_sats: number;
  alias: string;
  receiver_name: string;
  external_id: string;
  payment_hash: string;
  bolt11: string;
}

export class MockWapuClient implements WapuClient {
  private readonly tentatives = new Map<string, StoredTentative>();

  constructor(private readonly secret: string = "mock-webhook-secret") {}

  async createDirectPayment(
    req: CreateDirectPaymentRequest
  ): Promise<DirectPaymentTentative> {
    const uuid = `mock_dp_${randomBytes(8).toString("hex")}`;
    const paymentHash = randomBytes(32).toString("hex");
    const rate = await getSatsPerArs();
    const amountSats = Math.round(req.amount_ars * rate);
    this.tentatives.set(uuid, {
      amount_ars: req.amount_ars,
      amount_sats: amountSats,
      alias: req.alias,
      receiver_name: req.receiver_name,
      external_id: req.external_id,
      payment_hash: paymentHash,
      bolt11: `lnbc${amountSats}n1mock${paymentHash.slice(0, 32)}`,
    });
    return { uuid, status: "CREATED" };
  }

  async issueDirectPaymentFunding(
    tentative_uuid: string
  ): Promise<DirectPaymentFunding> {
    const stored = this.tentatives.get(tentative_uuid);
    if (!stored) {
      throw new Error(`mock_tentative_not_found: ${tentative_uuid}`);
    }
    return {
      bolt11: stored.bolt11,
      payment_hash: stored.payment_hash,
      // Reuse the snapshot from createDirectPayment so a rate move
      // between the two calls can't re-price an in-flight tentative.
      amount_sats: stored.amount_sats,
      amount_ars: stored.amount_ars,
      expires_at: Math.floor(Date.now() / 1000) + MOCK_TENTATIVE_TTL_SECONDS,
    };
  }

  async getTentative(uuid: string): Promise<WapuTentativeState> {
    return {
      uuid,
      status: "pending",
      payment_hash: this.tentatives.get(uuid)?.payment_hash ?? "",
      paid_at: null,
      settlement_ref: null,
    };
  }

  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | null
  ): boolean {
    return verifyHmacSignature(this.secret, rawBody, signatureHeader);
  }

  /**
   * Test/dev-only helper: produce the exact bytes a webhook delivery
   * would carry, plus the signature header that would prove
   * authenticity. Lets the integration tests POST a "real" webhook
   * without spinning up a real Wapu environment.
   */
  signWebhookPayload(event: WapuWebhookEvent): {
    rawBody: string;
    signature: string;
  } {
    const rawBody = JSON.stringify(event);
    const signature = createHmac("sha256", this.secret)
      .update(rawBody, "utf8")
      .digest("base64");
    return { rawBody, signature };
  }
}

// --- Shared HMAC helper ------------------------------------------

function verifyHmacSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

// --- Real client (placeholder) ----------------------------------

class UnimplementedWapuClient implements WapuClient {
  private fail(method: string): never {
    throw new Error(
      `RealWapuClient.${method} is not implemented yet. The Wapu direct-payment endpoints are documented at ` +
        `https://github.com/wapu-app/wapu-cli/pull/7 but not yet wired here. ` +
        `Set WAPU_API_KEY to empty (the default) to fall back to MockWapuClient.`
    );
  }
  async createDirectPayment(): Promise<DirectPaymentTentative> {
    this.fail("createDirectPayment");
  }
  async issueDirectPaymentFunding(): Promise<DirectPaymentFunding> {
    this.fail("issueDirectPaymentFunding");
  }
  async getTentative(): Promise<WapuTentativeState> {
    this.fail("getTentative");
  }
  verifyWebhookSignature(): boolean {
    this.fail("verifyWebhookSignature");
  }
}

// --- Factory ------------------------------------------------------

let cached: WapuClient | null = null;

/**
 * Reset the cached client. Test-only. Production callers must not
 * use this — the WapuClient is meant to be a process-wide singleton
 * so a misconfigured second instance can't accidentally talk to a
 * different Wapu account.
 */
export function _resetWapuClientForTests(): void {
  cached = null;
}

export function getWapuClient(): WapuClient {
  if (cached) return cached;
  const apiKey = process.env.WAPU_API_KEY;
  if (!apiKey) {
    const secret = process.env.WAPU_WEBHOOK_SECRET || "mock-webhook-secret";
    cached = new MockWapuClient(secret);
    return cached;
  }
  cached = new UnimplementedWapuClient();
  return cached;
}
