// @vitest-environment node
import { describe, it, expect } from "vitest";
import "../setup"; // side effect: loads .env.test (NWC_TEST_URI)
import {
  validateNwcConnection,
  mintNwcInvoice,
  lookupNwcInvoice,
} from "@/lib/nwc";

/**
 * Live smoke test of the NWC sats rail (ADR 0029) against a real
 * wallet. It proves the real relay connection, the NIP-47 encryption
 * handshake, and the make_invoice / lookup_invoice request/response
 * shapes end-to-end.
 *
 * Set NWC_TEST_URI in .env.test to a **receive-only**
 * `nostr+walletconnect://` connection (no pay_invoice permission —
 * the test only mints + looks up). Runs only when it's present; skips
 * otherwise so a credential-less CI run stays green. We mint a 1-sat
 * invoice and never pay it, so it stays unsettled and the wallet
 * balance is untouched.
 */
const NWC_TEST_URI = process.env.NWC_TEST_URI;

describe.skipIf(!NWC_TEST_URI)("NWC staging — real-wallet smoke", () => {
  const uri = NWC_TEST_URI as string;

  it("validates the connection (get_info + make_invoice/lookup_invoice)", async () => {
    const info = await validateNwcConnection(uri);
    expect(info.methods).toContain("make_invoice");
    expect(info.methods).toContain("lookup_invoice");
  });

  it("mints an invoice and looks it up as unsettled", async () => {
    const minted = await mintNwcInvoice(uri, 1, "cursats smoke");
    expect(minted.bolt11).toMatch(/^ln/i);
    expect(minted.payment_hash).toMatch(/^[0-9a-f]{64}$/i);

    const state = await lookupNwcInvoice(uri, minted.payment_hash);
    expect(state.settled).toBe(false); // we never pay the probe invoice
  });
});
