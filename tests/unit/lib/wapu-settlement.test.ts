// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { quoteSellerPayout } from "@/lib/wapu-settlement";
import {
  _setWapuClientForTests,
  _resetWapuClientForTests,
  type WapuClient,
  type TentativeAmount,
  type TentativeAmountRequest,
} from "@/lib/wapu";

// quoteSellerPayout is the shared formula behind two surfaces: the
// create-course payout preview and the actual seller withdrawal. The
// seller bears Wapu's fee (ADR 0026), so net = gross − fee, and the
// create-course form floors a course at WAPU_MIN_NET_ARS using exactly
// this number. The fee comes back from Wapu in USDT; we convert to ARS
// with the quoted rate and round.

/**
 * Build a fake Wapu client whose `tentativeAmount` returns a fixed fee +
 * rate and records the request it was called with. Only the one method
 * quoteSellerPayout touches is implemented; the rest throw if reached.
 */
function fakeWapu(fee: number, exchange_rate: number) {
  const calls: TentativeAmountRequest[] = [];
  const client = {
    tentativeAmount: async (
      req: TentativeAmountRequest
    ): Promise<TentativeAmount> => {
      calls.push(req);
      return { exchange_rate, fee, total_amount: 0, usdt_amount: 0 };
    },
  } as unknown as WapuClient;
  return { client, calls };
}

afterEach(() => {
  _resetWapuClientForTests();
});

describe("quoteSellerPayout", () => {
  it("nets the ARS-converted fee out of the gross", async () => {
    const { client } = fakeWapu(0.5, 1000); // fee 0.5 USDT @ 1000 ARS/USDT
    _setWapuClientForTests(client);

    const quote = await quoteSellerPayout(20_000, "fiat_transfer");

    expect(quote.gross_ars).toBe(20_000);
    expect(quote.fee_ars).toBe(500); // round(0.5 * 1000)
    expect(quote.net_ars).toBe(19_500); // 20000 - 500
    expect(quote.exchange_rate).toBe(1000);
  });

  it("rounds the converted fee to the nearest ARS", async () => {
    const { client } = fakeWapu(0.1235, 1000); // 123.5 -> 124
    _setWapuClientForTests(client);

    const quote = await quoteSellerPayout(10_000, "fiat_transfer");
    expect(quote.fee_ars).toBe(124);
    expect(quote.net_ars).toBe(9_876);
  });

  it("floors net at 0 when the fee would exceed the gross", async () => {
    const { client } = fakeWapu(100, 1000); // fee 100 000 ARS on a 5 000 course
    _setWapuClientForTests(client);

    const quote = await quoteSellerPayout(5_000, "fiat_transfer");
    expect(quote.net_ars).toBe(0);
  });

  it("quotes against the seller's transfer speed in ARS→USDT", async () => {
    const { client, calls } = fakeWapu(1, 1000);
    _setWapuClientForTests(client);

    await quoteSellerPayout(15_000, "fast_fiat_transfer");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      amount: 15_000,
      currency_payment: "ARS",
      currency_taken: "USDT",
      type: "fast_fiat_transfer",
    });
  });
});
