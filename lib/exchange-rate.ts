/**
 * Single source of truth for the ARS↔sats conversion the app
 * displays and quotes against (ADR 0019; rate source is Wapu per
 * ADR 0027, superseding the Yadio source of ADR 0022).
 *
 * The seller prices an offering in ONE currency; every other place a
 * price is shown computes the other side through `convertPrice`,
 * which reads `getSatsPerArs()`. We source the rate from Wapu's
 * `/exchange_rates` so the storefront estimate matches the rail that
 * actually settles the order. We use the **buy** side of both
 * `USDT/ARS` and `BTC/USD`: ARS/BTC = (ARS per USDT, buy) × (USD per
 * BTC, buy). That is the same side Wapu credits a Lightning deposit
 * and debits a fiat withdrawal at, so a deposit sized from this rate
 * credits just enough USDT to fund the seller's net ARS payout — the
 * platform float nets to ~0 (see `lib/orders.ts` / ADR 0025/0026).
 *
 * Resolution order for `getSatsPerArs()`:
 *   1. Live Wapu rate, cached 5 min per process.
 *   2. Last good rate we ever fetched (even if its 5-min window
 *      expired) — a slightly stale real rate beats a made-up one.
 *   3. A static cold-start fallback, logged loudly so an outage on
 *      first boot is visible rather than silently ~off.
 * Under test (`NODE_ENV === "test"`) the network is never touched:
 * a deterministic constant is returned so the suite is offline and
 * stable. Tests that need a specific rate use the seams at the
 * bottom of this file.
 */

const SATS_PER_BTC = 100_000_000;

// Deterministic rate for the test suite. Kept at the historical mock
// value so existing fixtures/assertions that depend on the dev rate
// (e.g. the Wapu mock funding flow) keep their behaviour.
const TEST_SATS_PER_ARS = 4;

// Cold-start safety net: only used if the very first fetch fails and
// no rate was ever cached. Expressed as ARS-per-BTC because that is
// the figure a human can sanity-check ("≈ 110M ARS per bitcoin"); it
// WILL drift from the market over time, which is why it is the last
// resort and its use is logged. Refresh occasionally.
const STATIC_FALLBACK_ARS_PER_BTC = 110_000_000;
const STATIC_FALLBACK_SATS_PER_ARS = SATS_PER_BTC / STATIC_FALLBACK_ARS_PER_BTC;

// Sanity bounds on the upstream ARS/BTC figure. Wide on purpose — the
// point is to reject `0`, `NaN`, negatives and obvious garbage, not to
// second-guess the market. Bitcoin priced under 1M ARS or over 100B
// ARS is a broken response, not a real quote.
const MIN_ARS_PER_BTC = 1_000_000;
const MAX_ARS_PER_BTC = 100_000_000_000;

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

let cached: { rate: number; expiresAt: number } | null = null;
// Survives cache expiry: the last rate we successfully fetched, so a
// transient upstream outage degrades to "slightly stale" not "wrong".
let lastGoodRate: number | null = null;

// Test-only override. When set, `getSatsPerArs()` returns it verbatim
// (still subject to the test-env short-circuit). Null = use default.
let testRateOverride: number | null = null;

// Test-only escape hatch: when true, the `NODE_ENV === "test"`
// short-circuit is bypassed so a test can stub `fetch` and exercise
// the real resolution order (live → last-good → static fallback).
// Off by default so the rest of the suite stays offline.
let liveFetchForTests = false;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

/**
 * Returns the current sats-per-ARS exchange rate. Cached for 5
 * minutes per process so the storefront doesn't hammer the rate API
 * on every page view. The cache is intentionally process-local — a
 * stale rate across two pods is fine; what we want to avoid is one
 * pod hammering the rate API on every request. Never throws: callers
 * (server components rendering prices) must not crash on an upstream
 * blip, so the resolution order always yields a usable number.
 */
export async function getSatsPerArs(): Promise<number> {
  if (isTestEnv() && !liveFetchForTests) {
    return testRateOverride ?? TEST_SATS_PER_ARS;
  }
  if (testRateOverride !== null) {
    return testRateOverride;
  }

  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.rate;

  try {
    const rate = await fetchSatsPerArs();
    cached = { rate, expiresAt: now + CACHE_TTL_MS };
    lastGoodRate = rate;
    return rate;
  } catch (err) {
    if (lastGoodRate !== null) {
      console.error(
        "[exchange-rate] live fetch failed; serving last good rate",
        lastGoodRate,
        err
      );
      // Re-arm the TTL so we retry on the next window rather than on
      // every single request while upstream is down.
      cached = { rate: lastGoodRate, expiresAt: now + CACHE_TTL_MS };
      return lastGoodRate;
    }
    console.error(
      "[exchange-rate] live fetch failed and no cached rate; using static fallback",
      STATIC_FALLBACK_SATS_PER_ARS,
      err
    );
    return STATIC_FALLBACK_SATS_PER_ARS;
  }
}

/**
 * Fetch Wapu's `/exchange_rates` and derive sats-per-ARS from the buy
 * side of USDT/ARS and BTC/USD. Throws on timeout, non-2xx, malformed
 * body, a missing pair, or an out-of-bounds figure so the caller can
 * fall back.
 */
async function fetchSatsPerArs(): Promise<number> {
  const host = process.env.WAPU_PAY_APU_HOST;
  if (!host) {
    throw new Error("exchange_rate_no_host: WAPU_PAY_APU_HOST is unset");
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  let body: unknown;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = process.env.WAPU_API_KEY;
    if (apiKey) headers["X-API-Key"] = apiKey;
    const res = await fetch(`${host.replace(/\/+$/, "")}/exchange_rates`, {
      signal: ctl.signal,
      headers,
      // The 5-minute in-process cache above is our caching layer;
      // never let the platform fetch cache pin a stale rate.
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`exchange_rate_http_${res.status}`);
    }
    body = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const arsPerBtc = readArsPerBtcFromWapu(body);
  if (
    !Number.isFinite(arsPerBtc) ||
    arsPerBtc < MIN_ARS_PER_BTC ||
    arsPerBtc > MAX_ARS_PER_BTC
  ) {
    throw new Error(`exchange_rate_out_of_bounds: ars_per_btc=${arsPerBtc}`);
  }
  const satsPerArs = SATS_PER_BTC / arsPerBtc;
  if (!Number.isFinite(satsPerArs) || satsPerArs <= 0) {
    throw new Error(`exchange_rate_invalid: sats_per_ars=${satsPerArs}`);
  }
  return satsPerArs;
}

/**
 * Wapu `/exchange_rates` → `{ rates: [{ pair, buy, sell }] }`. We
 * compute ARS per BTC from the buy side of USDT/ARS (ARS per USDT)
 * and BTC/USD (USD per BTC), treating USDT as USD. Returns NaN when a
 * required pair is absent so the bounds check rejects it.
 */
function readArsPerBtcFromWapu(body: unknown): number {
  if (typeof body !== "object" || body === null) return NaN;
  const rates = (body as { rates?: unknown }).rates;
  if (!Array.isArray(rates)) return NaN;
  const buyOf = (pair: string): number => {
    const row = rates.find(
      (r): r is Record<string, unknown> =>
        typeof r === "object" && r !== null && (r as { pair?: unknown }).pair === pair
    );
    const raw = row?.buy;
    return typeof raw === "number" ? raw : Number(raw);
  };
  const arsPerUsdt = buyOf("USDT/ARS");
  const usdPerBtc = buyOf("BTC/USD");
  return arsPerUsdt * usdPerBtc;
}

/**
 * Convert a price in one currency to the other using the current
 * rate. Rounds to the nearest integer in the target currency —
 * neither sats nor centavos make sense as fractions in the UI.
 */
export async function convertPrice(
  amount: number,
  from: "ars" | "sats",
  to: "ars" | "sats"
): Promise<number> {
  if (from === to) return amount;
  const rate = await getSatsPerArs();
  if (from === "ars" && to === "sats") return Math.round(amount * rate);
  return Math.round(amount / rate);
}

/**
 * Test-only seam: drop the cache (and last-good rate) so the next
 * `getSatsPerArs()` call re-resolves from scratch. Don't call this
 * from production code paths.
 */
export function __resetExchangeRateCacheForTests(): void {
  cached = null;
  lastGoodRate = null;
  testRateOverride = null;
  liveFetchForTests = false;
}

/**
 * Test-only seam: bypass the test-env short-circuit so a test can
 * stub `fetch` and exercise the real live → last-good → static
 * fallback resolution order. Don't call this from production code
 * paths. Cleared by `__resetExchangeRateCacheForTests`.
 */
export function __enableLiveFetchForTests(on: boolean): void {
  liveFetchForTests = on;
}

/**
 * Test-only seam: pin `getSatsPerArs()` to a specific rate (sats per
 * ARS) regardless of environment, or pass `null` to clear the pin and
 * fall back to the deterministic test default. Don't call this from
 * production code paths.
 */
export function __setSatsPerArsForTests(rate: number | null): void {
  testRateOverride = rate;
}
