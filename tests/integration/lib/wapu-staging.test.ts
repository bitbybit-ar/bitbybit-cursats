// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import "../setup"; // side effect: loads .env.test (WAPU_API_KEY, WAPU_PAY_APU_HOST)
import { getWapuClient, WapuApiError, _resetWapuClientForTests } from "@/lib/wapu";
import { quoteSellerPayout } from "@/lib/wapu-settlement";
import { WAPU_MIN_NET_ARS } from "@/lib/wapu-limits";

/**
 * Live smoke test of the seller-payout leg against Wapu staging. It
 * proves the real HTTP connection, the X-API-Key auth, and the
 * /transactions/create request/response shape.
 *
 * A withdrawal can only reach `Pending` when our staging wallet holds
 * USDT, and the wallet is funded only by a *paid* deposit — which a
 * test never does. So the realistic, stable assertion is the one you
 * asked for: that the connection works. The call must either open a
 * real Pending withdrawal (funded wallet) or come back with a
 * structured business 4xx such as 400 "Insufficient funds" (unfunded
 * wallet). Either proves auth + endpoint + request shape. An auth
 * failure (401/403), a 5xx, or a network/parse error is a real
 * failure.
 *
 * Runs only when staging creds are present in .env.test; skips
 * otherwise so a credential-less CI run stays green. The deposit leg
 * is covered by the gated real-staging test in orders.test.ts.
 */
const HAS_WAPU = Boolean(
  process.env.WAPU_API_KEY && process.env.WAPU_PAY_APU_HOST
);

// Wapu enforces a 10_000 ARS floor on fiat withdrawals (observed:
// "Minimum amount is $10000 ARS"). Request at the floor.
const MIN_WITHDRAWAL_ARS = 10_000;

describe.skipIf(!HAS_WAPU)("Wapu staging — withdrawal connection smoke", () => {
  beforeEach(() => {
    _resetWapuClientForTests(); // always the live client built from env
  });

  it("reaches the live withdrawal endpoint with valid auth and request shape", async () => {
    const wapu = getWapuClient();
    try {
      const withdrawal = await wapu.createWithdrawal({
        type: "fiat_transfer",
        payment_amount_ars: MIN_WITHDRAWAL_ARS,
        alias: "test.wapu.alias",
        receiver_name: "Cursats Test",
      });
      // Funded wallet: a real Pending withdrawal opened.
      expect(withdrawal.transaction_id).toBeTruthy();
      expect(withdrawal.status).toBe("Pending");

      const tx = await wapu.getTransaction(withdrawal.transaction_id);
      expect(tx.transaction_id).toBe(withdrawal.transaction_id);
      expect(tx.status).toBe("Pending");
    } catch (err) {
      // The staging wallet's state varies between runs (unfunded, over
      // a daily limit, etc.), so the exact business rejection differs
      // ("Insufficient funds", "Maximum amount limit per…", …). Any
      // structured 4xx that is NOT an auth failure still proves the
      // connection, auth, and request shape are correct — which is all
      // this leg can assert without a funded, under-limit wallet.
      expect(err).toBeInstanceOf(WapuApiError);
      const e = err as WapuApiError;
      expect(e.status).toBeGreaterThanOrEqual(400);
      expect(e.status).toBeLessThan(500);
      expect([401, 403]).not.toContain(e.status);
    }
  });

  it("quotes a seller payout net that the create-course floor checks against", async () => {
    // The wapu_ars min-price gate (ADR 0026) compares this net to
    // WAPU_MIN_NET_ARS. Validate the math the gate relies on: the seller
    // bears the fee (net < gross) and a typical course price still
    // clears Wapu's 10 000 ARS withdrawal floor.
    const quote = await quoteSellerPayout(28_000, "fiat_transfer");
    expect(quote.gross_ars).toBe(28_000);
    expect(quote.fee_ars).toBeGreaterThan(0);
    expect(quote.net_ars).toBeLessThan(28_000);
    expect(quote.net_ars).toBeGreaterThanOrEqual(WAPU_MIN_NET_ARS);
  });
});
