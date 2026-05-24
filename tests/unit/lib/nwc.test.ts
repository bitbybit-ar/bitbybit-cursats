// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import {
  validateNwcConnection,
  mintNwcInvoice,
  lookupNwcInvoice,
  NwcError,
  _setNwcClientFactoryForTests,
  _resetNwcClientFactoryForTests,
} from "@/lib/nwc";
import { Nip47WalletError, Nip47TimeoutError } from "@getalby/sdk";

// Well-formed connection strings (real `@getalby/sdk`
// parseWalletConnectUrl parses these — only the client is faked).
const PUBKEY = "a".repeat(64);
const SECRET = "b".repeat(64);
const uriWith = (relay: string) =>
  `nostr+walletconnect://${PUBKEY}?relay=${relay}&secret=${SECRET}`;
const URI = uriWith("wss://relay.example.com");

type FakeMethods = {
  getInfo?: () => Promise<unknown>;
  makeInvoice?: () => Promise<unknown>;
  lookupInvoice?: () => Promise<unknown>;
};

function injectClient(methods: FakeMethods) {
  _setNwcClientFactoryForTests((() => ({
    getInfo: methods.getInfo ?? (async () => ({ methods: [] })),
    makeInvoice: methods.makeInvoice ?? (async () => ({})),
    lookupInvoice: methods.lookupInvoice ?? (async () => ({})),
    close: () => {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any);
}

afterEach(() => _resetNwcClientFactoryForTests());

describe("URI + relay guard (real parser, no client)", () => {
  it("rejects a non-nostr+walletconnect URI", async () => {
    await expect(
      mintNwcInvoice("https://evil.example", 10)
    ).rejects.toMatchObject({ code: "invalid_uri" });
  });

  it("rejects a private/loopback relay (SSRF guard)", async () => {
    await expect(
      mintNwcInvoice(uriWith("wss://127.0.0.1"), 10)
    ).rejects.toMatchObject({ code: "invalid_uri" });
  });

  it("rejects a non-wss relay scheme", async () => {
    await expect(
      mintNwcInvoice(uriWith("ws://relay.example.com"), 10)
    ).rejects.toMatchObject({ code: "invalid_uri" });
  });

  it("rejects a URI with no secret", async () => {
    await expect(
      mintNwcInvoice(
        `nostr+walletconnect://${PUBKEY}?relay=wss://relay.example.com`,
        10
      )
    ).rejects.toMatchObject({ code: "invalid_uri" });
  });
});

describe("mintNwcInvoice", () => {
  it("returns the minted invoice and converts sats to msat", async () => {
    let seen: { amount: number; description?: string } | undefined;
    injectClient({
      makeInvoice: async (...args: unknown[]) => {
        seen = args[0] as { amount: number; description?: string };
        return {
          invoice: "lnbc100n1pexample",
          payment_hash: "abcd",
          expires_at: 1893456000,
        };
      },
    });
    const out = await mintNwcInvoice(URI, 21, "Course");
    expect(out).toMatchObject({
      bolt11: "lnbc100n1pexample",
      payment_hash: "abcd",
      amount_sats: 21,
      expires_at: 1893456000,
    });
    expect(seen).toMatchObject({ amount: 21000, description: "Course" });
  });

  it("maps a wallet error to make_invoice_failed", async () => {
    injectClient({
      makeInvoice: async () => {
        throw new Nip47WalletError("nope", "OTHER");
      },
    });
    await expect(mintNwcInvoice(URI, 10)).rejects.toMatchObject({
      code: "make_invoice_failed",
    });
  });

  it("maps a timeout/network error to unreachable", async () => {
    injectClient({
      makeInvoice: async () => {
        throw new Nip47TimeoutError("slow", "TIMEOUT");
      },
    });
    await expect(mintNwcInvoice(URI, 10)).rejects.toMatchObject({
      code: "unreachable",
    });
  });

  it("fails when the wallet returns no invoice", async () => {
    injectClient({ makeInvoice: async () => ({ payment_hash: "abcd" }) });
    await expect(mintNwcInvoice(URI, 10)).rejects.toBeInstanceOf(NwcError);
  });
});

describe("lookupNwcInvoice", () => {
  it("reports settled with the preimage", async () => {
    injectClient({
      lookupInvoice: async () => ({ state: "settled", preimage: "pre" }),
    });
    expect(await lookupNwcInvoice(URI, "abcd")).toEqual({
      settled: true,
      preimage: "pre",
    });
  });

  it("reports not-settled for a pending invoice", async () => {
    injectClient({ lookupInvoice: async () => ({ state: "pending" }) });
    expect(await lookupNwcInvoice(URI, "abcd")).toEqual({
      settled: false,
      preimage: null,
    });
  });

  it("treats a wallet error as not-settled so the poller keeps polling", async () => {
    injectClient({
      lookupInvoice: async () => {
        throw new Nip47WalletError("unknown invoice", "NOT_FOUND");
      },
    });
    expect(await lookupNwcInvoice(URI, "abcd")).toEqual({
      settled: false,
      preimage: null,
    });
  });

  it("throws on a relay/timeout failure so the caller can surface it", async () => {
    injectClient({
      lookupInvoice: async () => {
        throw new Nip47TimeoutError("slow", "TIMEOUT");
      },
    });
    await expect(lookupNwcInvoice(URI, "abcd")).rejects.toMatchObject({
      code: "unreachable",
    });
  });
});

describe("validateNwcConnection", () => {
  it("rejects a connection missing make_invoice/lookup_invoice", async () => {
    injectClient({
      getInfo: async () => ({ methods: ["get_info"], alias: "w" }),
    });
    await expect(validateNwcConnection(URI)).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("accepts a connection that can mint + look up, and flags spend", async () => {
    injectClient({
      getInfo: async () => ({
        methods: ["make_invoice", "lookup_invoice", "pay_invoice"],
        alias: "My Wallet",
      }),
      makeInvoice: async () => ({ payment_hash: "probe" }),
      lookupInvoice: async () => ({ state: "pending" }),
    });
    expect(await validateNwcConnection(URI)).toEqual({
      alias: "My Wallet",
      methods: ["make_invoice", "lookup_invoice", "pay_invoice"],
      canPay: true,
    });
  });
});

// The real-wallet smoke test lives in tests/integration (it hits a
// live relay), gated on NWC_TEST_URI, mirroring the Wapu staging test.
// Keeping it out of the unit suite keeps unit hermetic.
