import "server-only";
import {
  NWCClient,
  Nip47NetworkError,
  Nip47TimeoutError,
  Nip47WalletError,
} from "@getalby/sdk";
import { extractPaymentHash, isPrivateOrLocalHost } from "@/lib/lightning";

/**
 * NWC (Nostr Wallet Connect, NIP-47) seam for the sats rail — the
 * second input method alongside the LUD-21 Lightning Address (ADR
 * 0029). Where the LN-address path mints against an LNURL-pay callback
 * and confirms via a LUD-21 `verify` URL, this path talks straight to
 * the seller's wallet over a relay:
 *
 *   - `mintNwcInvoice` ↔ NIP-47 `make_invoice` (checkout)
 *   - `lookupNwcInvoice` ↔ NIP-47 `lookup_invoice` (order poller)
 *   - `validateNwcConnection` ↔ `get_info` + a probe mint (settings)
 *
 * The shapes mirror `lib/lightning.ts` (`MintedInvoice` / `VerifyState`)
 * so the checkout + poll code stays uniform across both sats methods.
 *
 * The connection URI is a wallet credential and is decrypted from
 * `users.nwc_uri` only here, server-side. The relay(s) inside the URI
 * are seller-controlled, so we SSRF-guard them (public `wss:` only)
 * before connecting. Uses `@getalby/sdk` (the org's NIP-47 client,
 * shared with bitbybit-habits).
 */

// A single relay round-trip. Without this a dead relay would hang
// checkout / the poller until the platform's own request times out.
const NWC_TIMEOUT_MS = 12_000;

// The only NIP-47 methods Cursats needs. We never spend from the
// seller's wallet, so `pay_invoice` is deliberately absent — the
// settings UI tells sellers to grant a receive-only connection.
const REQUIRED_METHODS = ["make_invoice", "lookup_invoice"] as const;

export type NwcErrorCode =
  | "invalid_uri"
  | "unreachable"
  | "unsupported"
  | "make_invoice_failed"
  | "lookup_failed"
  | "no_payment_hash";

export class NwcError extends Error {
  constructor(
    public readonly code: NwcErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "NwcError";
  }
}

export interface NwcMintedInvoice {
  bolt11: string;
  /** Hex-encoded 32-byte payment hash. */
  payment_hash: string;
  amount_sats: number;
  /** Unix seconds. */
  expires_at: number;
}

export interface NwcVerifyState {
  settled: boolean;
  /** Hex preimage when the wallet returns it on a settled invoice. */
  preimage: string | null;
}

export interface NwcConnectionInfo {
  alias: string | null;
  methods: string[];
  /** True when the connection also grants spend. We warn, never block. */
  canPay: boolean;
}

// --- URI parsing + relay SSRF guard ------------------------------

/**
 * Structurally validate a `nostr+walletconnect://` URI and assert its
 * relay(s) are public `wss:` endpoints. The URI is seller-controlled,
 * so a relay could otherwise point at an internal websocket service.
 * Throws {@link NwcError} with code `invalid_uri`.
 */
function parseAndGuardUri(uri: string): void {
  if (
    typeof uri !== "string" ||
    !uri.trim().startsWith("nostr+walletconnect://")
  ) {
    throw new NwcError("invalid_uri", "expected a nostr+walletconnect:// URI");
  }
  let opts: { relayUrls?: string[]; walletPubkey?: string; secret?: string };
  try {
    opts = NWCClient.parseWalletConnectUrl(uri.trim());
  } catch {
    throw new NwcError("invalid_uri", "could not parse NWC URI");
  }
  if (!opts.walletPubkey || !opts.secret) {
    throw new NwcError("invalid_uri", "NWC URI is missing a pubkey or secret");
  }
  if (!Array.isArray(opts.relayUrls) || opts.relayUrls.length === 0) {
    throw new NwcError("invalid_uri", "NWC URI has no relay");
  }
  for (const relay of opts.relayUrls) {
    assertSafeRelay(relay);
  }
}

function assertSafeRelay(relay: string): void {
  let url: URL;
  try {
    url = new URL(relay);
  } catch {
    throw new NwcError("invalid_uri", `bad relay url: ${relay}`);
  }
  if (url.protocol !== "wss:") {
    throw new NwcError(
      "invalid_uri",
      `relay must be wss: (got ${url.protocol})`
    );
  }
  const host = url.hostname.toLowerCase();
  if (!host || !host.includes(".")) {
    throw new NwcError("invalid_uri", `bare relay hostname: ${host}`);
  }
  if (isPrivateOrLocalHost(host)) {
    throw new NwcError("invalid_uri", `private relay host: ${host}`);
  }
}

// --- client plumbing ---------------------------------------------

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new NwcError("unreachable", `nwc timeout: ${label}`)),
      NWC_TIMEOUT_MS
    );
  });
  return Promise.race([p, timeout]).finally(() =>
    clearTimeout(timer)
  ) as Promise<T>;
}

// The slice of NWCClient this module actually uses. Kept as a seam so
// tests can inject a fake client without standing up a relay — the
// same pattern lib/lightning.ts uses for its LightningClient.
type NwcClientLike = Pick<
  NWCClient,
  "getInfo" | "makeInvoice" | "lookupInvoice" | "close"
>;

let buildNwcClient: (uri: string) => NwcClientLike = (uri) =>
  new NWCClient({ nostrWalletConnectUrl: uri });

/** Test-only: inject a fake NWC client factory. */
export function _setNwcClientFactoryForTests(
  factory: (uri: string) => NwcClientLike
): void {
  buildNwcClient = factory;
}

/** Test-only: restore the real `@getalby/sdk` client factory. */
export function _resetNwcClientFactoryForTests(): void {
  buildNwcClient = (uri) => new NWCClient({ nostrWalletConnectUrl: uri });
}

/**
 * Validate + guard the URI, open a client, run `fn`, and always close
 * the relay subscription afterwards (the SDK keeps it open otherwise).
 */
async function withClient<T>(
  uri: string,
  fn: (client: NwcClientLike) => Promise<T>
): Promise<T> {
  parseAndGuardUri(uri);
  const client = buildNwcClient(uri.trim());
  try {
    return await fn(client);
  } finally {
    try {
      client.close();
    } catch {
      // best-effort cleanup
    }
  }
}

function mapNwcError(e: unknown, fallback: NwcErrorCode): NwcError {
  if (e instanceof NwcError) return e;
  if (e instanceof Nip47TimeoutError || e instanceof Nip47NetworkError) {
    return new NwcError("unreachable", e.message);
  }
  if (e instanceof Nip47WalletError) {
    return new NwcError(fallback, e.message);
  }
  return new NwcError(fallback, e instanceof Error ? e.message : String(e));
}

// --- public surface ----------------------------------------------

/**
 * Confirm a connection works for our needs: it advertises
 * `make_invoice` + `lookup_invoice`, and a real probe mint + lookup
 * round-trips. Mirrors the LUD-21 1-sat probe on the LN-address rail.
 * Returns connection metadata (including whether spend is granted, so
 * the caller can warn the seller). Throws {@link NwcError}.
 */
export async function validateNwcConnection(
  uri: string
): Promise<NwcConnectionInfo> {
  return withClient(uri, async (client) => {
    let info;
    try {
      info = await withTimeout(client.getInfo(), "get_info");
    } catch (e) {
      throw mapNwcError(e, "unreachable");
    }
    const methods = Array.isArray(info.methods) ? info.methods.map(String) : [];
    const missing = REQUIRED_METHODS.filter((m) => !methods.includes(m));
    if (missing.length > 0) {
      throw new NwcError(
        "unsupported",
        `connection is missing required method(s): ${missing.join(", ")}`
      );
    }
    let probe;
    try {
      probe = await withTimeout(
        client.makeInvoice({
          amount: 1000,
          description: "Cursats connection check",
          expiry: 120,
        }),
        "make_invoice(probe)"
      );
    } catch (e) {
      throw mapNwcError(e, "make_invoice_failed");
    }
    if (!probe?.payment_hash) {
      throw new NwcError(
        "make_invoice_failed",
        "probe invoice has no payment_hash"
      );
    }
    try {
      await withTimeout(
        client.lookupInvoice({ payment_hash: probe.payment_hash }),
        "lookup_invoice(probe)"
      );
    } catch (e) {
      throw mapNwcError(e, "lookup_failed");
    }
    return {
      alias: info.alias || null,
      methods,
      canPay: methods.includes("pay_invoice"),
    };
  });
}

/**
 * Mint a BOLT11 against the seller's wallet for the buyer to pay.
 * Funds land in the seller's wallet — the platform is never in the
 * path.
 */
export async function mintNwcInvoice(
  uri: string,
  amount_sats: number,
  description?: string
): Promise<NwcMintedInvoice> {
  return withClient(uri, async (client) => {
    let tx;
    try {
      tx = await withTimeout(
        client.makeInvoice({
          amount: amount_sats * 1000,
          ...(description ? { description: description.slice(0, 200) } : {}),
        }),
        "make_invoice"
      );
    } catch (e) {
      throw mapNwcError(e, "make_invoice_failed");
    }
    const bolt11 = tx?.invoice;
    if (typeof bolt11 !== "string" || bolt11.length === 0) {
      throw new NwcError(
        "make_invoice_failed",
        "make_invoice returned no invoice"
      );
    }
    const payment_hash = tx.payment_hash || extractPaymentHash(bolt11);
    if (!payment_hash) {
      throw new NwcError(
        "no_payment_hash",
        "make_invoice returned no payment_hash"
      );
    }
    const expires_at =
      typeof tx.expires_at === "number" && tx.expires_at > 0
        ? tx.expires_at
        : Math.floor(Date.now() / 1000) + 600;
    return { bolt11, payment_hash, amount_sats, expires_at };
  });
}

/**
 * Poll a previously minted invoice for settlement. A wallet-level
 * error (e.g. unknown invoice) resolves to "not settled" so the order
 * poller keeps polling; a relay/timeout failure throws so the caller
 * can surface a transient error.
 */
export async function lookupNwcInvoice(
  uri: string,
  payment_hash: string
): Promise<NwcVerifyState> {
  return withClient(uri, async (client) => {
    let tx;
    try {
      tx = await withTimeout(
        client.lookupInvoice({ payment_hash }),
        "lookup_invoice"
      );
    } catch (e) {
      const mapped = mapNwcError(e, "lookup_failed");
      if (mapped.code === "unreachable") throw mapped;
      return { settled: false, preimage: null };
    }
    const settled =
      tx?.state === "settled" ||
      (typeof tx?.settled_at === "number" && tx.settled_at > 0);
    const preimage =
      settled && typeof tx.preimage === "string" && tx.preimage.length > 0
        ? tx.preimage
        : null;
    return { settled, preimage };
  });
}
