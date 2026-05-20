// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  convertPrice,
  getSatsPerArs,
  __resetExchangeRateCacheForTests,
  __setSatsPerArsForTests,
  __enableLiveFetchForTests,
} from "@/lib/exchange-rate";

const SATS_PER_BTC = 100_000_000;
const STATIC_FALLBACK = SATS_PER_BTC / 110_000_000; // ≈ 0.9090909

function mockFetchOk(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

describe("exchange-rate/getSatsPerArs", () => {
  beforeEach(() => {
    __resetExchangeRateCacheForTests();
  });

  it("returns the deterministic test rate by default (no network)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const rate = await getSatsPerArs();
    expect(rate).toBe(4);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("honours a pinned test override and clears it on reset", async () => {
    __setSatsPerArsForTests(0.9);
    expect(await getSatsPerArs()).toBe(0.9);
    __resetExchangeRateCacheForTests();
    expect(await getSatsPerArs()).toBe(4);
  });
});

describe("exchange-rate/convertPrice", () => {
  beforeEach(() => {
    __resetExchangeRateCacheForTests();
  });
  afterEach(() => {
    __resetExchangeRateCacheForTests();
  });

  it("is a no-op when from === to", async () => {
    expect(await convertPrice(1234, "ars", "ars")).toBe(1234);
    expect(await convertPrice(56, "sats", "sats")).toBe(56);
  });

  it("converts ARS → sats and rounds to a whole sat", async () => {
    __setSatsPerArsForTests(0.878);
    // 10_000 ARS * 0.878 = 8780 sats
    expect(await convertPrice(10_000, "ars", "sats")).toBe(8780);
    // rounding: 1001 * 0.878 = 878.878 → 879
    expect(await convertPrice(1001, "ars", "sats")).toBe(879);
  });

  it("converts sats → ARS and rounds to a whole peso", async () => {
    __setSatsPerArsForTests(0.878);
    // 8780 sats / 0.878 = 10_000 ARS
    expect(await convertPrice(8780, "sats", "ars")).toBe(10_000);
    // rounding: 1000 / 0.878 = 1138.95 → 1139
    expect(await convertPrice(1000, "sats", "ars")).toBe(1139);
  });

  it("round-trips within rounding tolerance", async () => {
    __setSatsPerArsForTests(0.878);
    const ars = 49_999;
    const sats = await convertPrice(ars, "ars", "sats");
    const back = await convertPrice(sats, "sats", "ars");
    expect(Math.abs(back - ars)).toBeLessThanOrEqual(2);
  });
});

describe("exchange-rate/live fetch + fallback chain", () => {
  beforeEach(() => {
    __resetExchangeRateCacheForTests();
    __enableLiveFetchForTests(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    __resetExchangeRateCacheForTests();
  });

  it("converts a live ARS-per-BTC quote to sats-per-ARS and caches it", async () => {
    const fetchSpy = mockFetchOk({ rate: 113_923_472 });
    const first = await getSatsPerArs();
    expect(first).toBeCloseTo(SATS_PER_BTC / 113_923_472, 8);
    // Second call inside the 5-min window must not re-fetch.
    const second = await getSatsPerArs();
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts the `result` key when `rate` is absent", async () => {
    mockFetchOk({ result: 100_000_000 });
    expect(await getSatsPerArs()).toBeCloseTo(1, 8);
  });

  it("coerces a numeric string value", async () => {
    mockFetchOk({ rate: "113923472" });
    expect(await getSatsPerArs()).toBeCloseTo(SATS_PER_BTC / 113_923_472, 8);
  });

  it("falls back to the static rate on a non-2xx response (no prior good)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response);
    expect(await getSatsPerArs()).toBeCloseTo(STATIC_FALLBACK, 8);
  });

  it("rejects an out-of-bounds quote and uses the static fallback", async () => {
    mockFetchOk({ rate: 0 });
    expect(await getSatsPerArs()).toBeCloseTo(STATIC_FALLBACK, 8);
  });

  it("falls back to the static rate when fetch throws (no prior good)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    expect(await getSatsPerArs()).toBeCloseTo(STATIC_FALLBACK, 8);
  });

  it("serves the last good rate (not the static fallback) after the cache expires and a later fetch fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const fetchSpy = mockFetchOk({ rate: 113_923_472 });
    const good = await getSatsPerArs();
    expect(good).toBeCloseTo(SATS_PER_BTC / 113_923_472, 8);

    // Past the 5-minute TTL so the next call must re-resolve.
    vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
    fetchSpy.mockRejectedValue(new Error("upstream down"));

    const stale = await getSatsPerArs();
    expect(stale).toBe(good);
    expect(stale).not.toBeCloseTo(STATIC_FALLBACK, 4);
  });
});
