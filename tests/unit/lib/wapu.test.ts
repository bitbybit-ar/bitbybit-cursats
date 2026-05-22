// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  RealWapuClient,
  getWapuClient,
  _resetWapuClientForTests,
  isWapuTxComplete,
  isWapuTxFailed,
  depositUsdtCredited,
  type WapuTransaction,
} from "@/lib/wapu";

// There is no mock client to unit-test anymore (the live rail is
// exercised by the gated staging smoke tests). These cover the pure,
// network-free seam: the status helpers, the USDT-credit reader, and
// the factory's fail-loud env contract.

function tx(overrides: Partial<WapuTransaction> = {}): WapuTransaction {
  return {
    transaction_id: "tx_1",
    status: "Pending",
    type: "deposit",
    payment_amount: 0,
    payment_currency: "USDT",
    currency_taken: "SAT",
    total_amount_taken: 0,
    fee_taken: 0,
    current_rate: 0,
    bolt11: null,
    verify_url: null,
    expires_at: null,
    alias: null,
    receiver_name: null,
    ...overrides,
  };
}

describe("wapu/status helpers", () => {
  it("isWapuTxComplete is true only for Completed", () => {
    expect(isWapuTxComplete("Completed")).toBe(true);
    for (const s of ["Pending", "Taken", "Canceled", "UserPending", "Rejected"]) {
      expect(isWapuTxComplete(s)).toBe(false);
    }
  });

  it("isWapuTxFailed is true for Canceled and Rejected", () => {
    expect(isWapuTxFailed("Canceled")).toBe(true);
    expect(isWapuTxFailed("Rejected")).toBe(true);
    for (const s of ["Pending", "Completed", "Taken", "UserPending"]) {
      expect(isWapuTxFailed(s)).toBe(false);
    }
  });
});

describe("wapu/depositUsdtCredited", () => {
  it("returns the USDT payment_amount on a USDT-denominated credit", () => {
    expect(
      depositUsdtCredited(tx({ payment_currency: "USDT", payment_amount: 19.23 }))
    ).toBe(19.23);
  });

  it("returns null when the credit is not USDT-denominated", () => {
    expect(
      depositUsdtCredited(tx({ payment_currency: "ARS", payment_amount: 10_000 }))
    ).toBeNull();
  });
});

describe("getWapuClient factory", () => {
  beforeEach(() => {
    _resetWapuClientForTests();
    delete process.env.WAPU_API_KEY;
    delete process.env.WAPU_PAY_APU_HOST;
  });

  it("throws when WAPU_API_KEY is unset — there is no mock fallback", () => {
    expect(() => getWapuClient()).toThrow(/Wapu is not configured/);
  });

  it("throws when WAPU_PAY_APU_HOST is unset", () => {
    process.env.WAPU_API_KEY = "real-key";
    expect(() => getWapuClient()).toThrow(/WAPU_PAY_APU_HOST/);
  });

  it("returns the real client when both env vars are set, and caches it", () => {
    process.env.WAPU_API_KEY = "real-key";
    process.env.WAPU_PAY_APU_HOST = "https://be-stage.wapu.app";
    const client = getWapuClient();
    expect(client).toBeInstanceOf(RealWapuClient);
    expect(getWapuClient()).toBe(client);
  });
});
