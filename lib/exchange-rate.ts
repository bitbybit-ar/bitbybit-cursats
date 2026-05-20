import { getExchangeRateApiUrl } from "@/lib/env";

/**
 * Single source of truth for the ARS↔sats conversion the app
 * displays and quotes against (ADR 0019, source wired in ADR 0022).
 *
 * The seller prices an offering in ONE currency; every other place a
 * price is shown computes the other side through `convertPrice`,
 * which reads `getSatsPerArs()`. Wapu is the settlement rail and does
 * its own FX at funding time; we can't read Wapu's rate (no public
 * endpoint), so the storefront approximates it with Yadio's Argentine
 * crypto-market BTC/ARS rate — the parallel rate buyers and Wapu both
 * transact at. The "≈" prefix on the computed side already tells the
 * buyer it's an estimate; Wapu re-quotes at funding so a buyer never
 * pays against a stale figure (see `lib/orders.ts`, which locks an
 * ARS-equivalent at order creation).
 *
 * Resolution order for `getSatsPerArs()`:
 *   1. Live Yadio rate, cached 5 min per process.
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
 * Fetch ARS-per-BTC from the configured provider (Yadio by default)
 * and convert to sats-per-ARS. Throws on timeout, non-2xx, malformed
 * body, or an out-of-bounds figure so the caller can fall back.
 */
async function fetchSatsPerArs(): Promise<number> {
  const url = getExchangeRateApiUrl();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  let body: unknown;
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: "application/json" },
      // The 5-minute in-process cache above is our caching layer;
      // never let the platform fetch cache pin a stale rate.
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`exchange_rate_http_${res.status}: ${url}`);
    }
    body = await res.json();
  } finally {
    clearTimeout(timer);
  }

  // Yadio `/convert/1/BTC/ARS` → { result, rate, ... }; both are ARS
  // per 1 BTC. Accept either key so an overridden provider only has
  // to expose one of them.
  const arsPerBtc = readArsPerBtc(body);
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

function readArsPerBtc(body: unknown): number {
  if (typeof body !== "object" || body === null) return NaN;
  const obj = body as Record<string, unknown>;
  const raw = obj.rate ?? obj.result;
  return typeof raw === "number" ? raw : Number(raw);
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
