/**
 * Wapu integration seam.
 *
 * Wapu is a USDT-ledger wallet with no webhooks. The wapu_ars rail is
 * a two-leg, poll-driven flow:
 *
 *   1. Deposit (buyer → our wallet): POST /wallet/deposit_lightning
 *      mints a BOLT11 the buyer pays; the sats credit USDT to our
 *      Wapu balance. We poll GET /transactions/{id} until `Completed`.
 *   2. Withdrawal (our wallet → seller): POST /transactions/create
 *      opens a fiat_transfer that settles ARS to the seller's
 *      CBU/alias. The settlement cron polls it to `Completed`.
 *
 * There is exactly one implementation, RealWapuClient, talking to
 * `WAPU_PAY_APU_HOST` with the `X-API-Key` header. There is no mock:
 * `getWapuClient()` throws when the env is missing so a misconfigured
 * deploy fails loudly instead of silently faking payments. Tests hit
 * the live staging rail and assert only what our integration controls
 * — that a freshly created deposit/withdrawal reads back `Pending`.
 * Whether Wapu then settles it is Wapu's side and is not asserted.
 *
 * Response shapes mirror the live API (staging `be-stage.wapu.app`):
 * a transaction carries `transaction_id`, `status`
 * (Pending|Completed|Taken|Canceled|UserPending|Rejected),
 * `payment_amount`/`payment_currency`, `currency_taken`/
 * `total_amount_taken`, `fee_taken`, `current_rate`,
 * `lnurl_pr_invoice` (BOLT11), and `lnurl_verify_invoice`.
 */

// --- Status ------------------------------------------------------

export type WapuTxStatus =
  | "Pending"
  | "Completed"
  | "Taken"
  | "Canceled"
  | "UserPending"
  | "Rejected";

/** Terminal success for both deposit and withdrawal legs. */
export function isWapuTxComplete(status: string): boolean {
  return status === "Completed";
}

/** Terminal failure for both legs. */
export function isWapuTxFailed(status: string): boolean {
  return status === "Canceled" || status === "Rejected";
}

// --- Types -------------------------------------------------------

/** Normalized transaction, the same shape for deposits and withdrawals. */
export interface WapuTransaction {
  transaction_id: string;
  status: WapuTxStatus;
  type: string;
  /** Receiver-facing amount; currency is `payment_currency`. */
  payment_amount: number;
  payment_currency: string;
  /** Currency debited from our wallet (USDT for withdrawals; SAT for deposits). */
  currency_taken: string;
  total_amount_taken: number;
  fee_taken: number;
  current_rate: number;
  /** BOLT11 invoice the buyer pays (deposits only). */
  bolt11: string | null;
  verify_url: string | null;
  /** Unix seconds, or null when the upstream value is absent/unparseable. */
  expires_at: number | null;
  alias: string | null;
  receiver_name: string | null;
}

export interface LightningDepositResult {
  transaction_id: string;
  bolt11: string;
  amount_sats: number;
  expires_at: number;
}

export type WapuTransferType = "fiat_transfer" | "fast_fiat_transfer";

export interface CreateWithdrawalRequest {
  type: WapuTransferType;
  /** ARS the seller receives in their bank. */
  payment_amount_ars: number;
  /** Argentine bank alias OR 22-digit CBU (Wapu accepts both here). */
  alias: string;
  receiver_name: string;
}

export interface WithdrawalResult {
  transaction_id: string;
  status: WapuTxStatus;
}

export interface WapuRate {
  pair: string;
  buy: number;
  sell: number;
}

export interface WapuExchangeRates {
  rates: WapuRate[];
}

export type WapuPaymentCurrency = "ARS" | "BRL" | "USD";
export type WapuTakenCurrency = "USDT" | "SAT";

export interface TentativeAmountRequest {
  amount: number;
  currency_payment: WapuPaymentCurrency;
  currency_taken: WapuTakenCurrency;
  type: WapuTransferType;
}

export interface TentativeAmount {
  exchange_rate: number;
  /** Fee in `currency_taken` units. */
  fee: number;
  /** total_amount = usdt_amount + fee, in `currency_taken` units. */
  total_amount: number;
  /** Amount excluding fee, in `currency_taken` units (Wapu's field name). */
  usdt_amount: number;
}

export interface WapuClient {
  /** Leg 1: mint a Lightning deposit invoice for `amount_sats`. */
  createLightningDeposit(amount_sats: number): Promise<LightningDepositResult>;
  /** Poll a transaction (either leg) by id. */
  getTransaction(transaction_id: string): Promise<WapuTransaction>;
  /** Leg 2: open a fiat withdrawal to the seller's CBU/alias. */
  createWithdrawal(req: CreateWithdrawalRequest): Promise<WithdrawalResult>;
  /** Preview cost/fee for a hypothetical transaction (no side effects). */
  tentativeAmount(req: TentativeAmountRequest): Promise<TentativeAmount>;
  getExchangeRates(): Promise<WapuExchangeRates>;
}

/**
 * USDT credited to our wallet by a confirmed deposit. Wapu reports
 * the credited fiat-ledger amount in `payment_amount` with
 * `payment_currency = "USDT"`. Returns null if the transaction is not
 * a USDT-denominated credit (e.g. not yet confirmed in that shape).
 */
export function depositUsdtCredited(tx: WapuTransaction): number | null {
  return tx.payment_currency === "USDT" ? tx.payment_amount : null;
}

// --- Real client -------------------------------------------------

export class WapuApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string
  ) {
    super(`Wapu API ${status} on ${endpoint}: ${body.slice(0, 300)}`);
    this.name = "WapuApiError";
  }
}

type RawRecord = Record<string, unknown>;

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseExpiresAt(v: unknown): number | null {
  if (typeof v === "number") {
    // Heuristic: treat large values as milliseconds.
    return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  }
  return null;
}

function normalizeTransaction(raw: RawRecord): WapuTransaction {
  return {
    transaction_id: asString(raw.transaction_id) ?? "",
    status: (asString(raw.status) ?? "Pending") as WapuTxStatus,
    type: asString(raw.type) ?? "",
    payment_amount: asNumber(raw.payment_amount),
    payment_currency: asString(raw.payment_currency) ?? "",
    currency_taken: asString(raw.currency_taken) ?? "",
    total_amount_taken: asNumber(raw.total_amount_taken),
    fee_taken: asNumber(raw.fee_taken),
    current_rate: asNumber(raw.current_rate),
    bolt11: asString(raw.lnurl_pr_invoice),
    verify_url: asString(raw.lnurl_verify_invoice),
    expires_at: parseExpiresAt(raw.expires_at),
    alias: asString(raw.alias),
    receiver_name: asString(raw.receiver_name),
  };
}

const DEPOSIT_DEFAULT_TTL_SECONDS = 600;

export class RealWapuClient implements WapuClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: { baseUrl: string; apiKey: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
  }

  private async request(
    path: string,
    init: RequestInit & { body?: BodyInit }
  ): Promise<RawRecord> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "X-API-Key": this.apiKey,
        accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new WapuApiError(res.status, text, path);
    }
    try {
      return text ? (JSON.parse(text) as RawRecord) : {};
    } catch {
      throw new WapuApiError(res.status, `non-JSON body: ${text}`, path);
    }
  }

  async createLightningDeposit(
    amount_sats: number
  ): Promise<LightningDepositResult> {
    const raw = await this.request("/wallet/deposit_lightning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: amount_sats }),
    });
    const tx = normalizeTransaction(raw);
    if (!tx.bolt11) {
      throw new WapuApiError(
        502,
        `deposit_lightning returned no invoice: ${JSON.stringify(raw)}`,
        "/wallet/deposit_lightning"
      );
    }
    return {
      transaction_id: tx.transaction_id,
      bolt11: tx.bolt11,
      amount_sats,
      expires_at:
        tx.expires_at ??
        Math.floor(Date.now() / 1000) + DEPOSIT_DEFAULT_TTL_SECONDS,
    };
  }

  async getTransaction(transaction_id: string): Promise<WapuTransaction> {
    const raw = await this.request(
      `/transactions/${encodeURIComponent(transaction_id)}`,
      { method: "GET" }
    );
    return normalizeTransaction(raw);
  }

  async createWithdrawal(
    req: CreateWithdrawalRequest
  ): Promise<WithdrawalResult> {
    // transactions/create is multipart/form-data. Let fetch set the
    // boundary by passing a FormData instance (no explicit
    // content-type header).
    const form = new FormData();
    form.set("type", req.type);
    form.set("payment_amount", String(req.payment_amount_ars));
    form.set("currency_taken", "USDT");
    form.set("alias", req.alias);
    form.set("receiver_name", req.receiver_name);
    const raw = await this.request("/transactions/create", {
      method: "POST",
      body: form,
    });
    const tx = normalizeTransaction(raw);
    return { transaction_id: tx.transaction_id, status: tx.status };
  }

  async tentativeAmount(req: TentativeAmountRequest): Promise<TentativeAmount> {
    const raw = await this.request("/transactions/tentative-amount", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    return {
      exchange_rate: asNumber(raw.exchange_rate),
      fee: asNumber(raw.fee),
      total_amount: asNumber(raw.total_amount),
      usdt_amount: asNumber(raw.usdt_amount),
    };
  }

  async getExchangeRates(): Promise<WapuExchangeRates> {
    const raw = await this.request("/exchange_rates", { method: "GET" });
    const rates = Array.isArray(raw.rates) ? raw.rates : [];
    return {
      rates: (rates as RawRecord[]).map((r) => ({
        pair: asString(r.pair) ?? "",
        buy: asNumber(r.buy),
        sell: asNumber(r.sell),
      })),
    };
  }
}

// --- Factory -----------------------------------------------------

let cached: WapuClient | null = null;

/** Reset the cached client so the next call rebuilds from env. Test-only. */
export function _resetWapuClientForTests(): void {
  cached = null;
}

/**
 * Returns the live Wapu client, built from WAPU_API_KEY +
 * WAPU_PAY_APU_HOST. Throws when either is missing — in EVERY
 * environment, dev included. There is deliberately no mock: a missing
 * or half-set Wapu config must fail loudly (a 500 on the route that
 * needs Wapu) instead of silently faking payments, which would hide the
 * misconfiguration until real money was on the line.
 */
export function getWapuClient(): WapuClient {
  if (cached) return cached;
  const apiKey = process.env.WAPU_API_KEY;
  const host = process.env.WAPU_PAY_APU_HOST;
  if (!apiKey || !host) {
    throw new Error(
      "Wapu is not configured. Set WAPU_API_KEY and WAPU_PAY_APU_HOST " +
        "(e.g. https://be-stage.wapu.app or https://be-prod.wapu.app). " +
        "There is no mock fallback: a missing config fails loudly rather " +
        "than silently mocking payments."
    );
  }
  cached = new RealWapuClient({ baseUrl: host, apiKey });
  return cached;
}
