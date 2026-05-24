import { sha256 } from "@noble/hashes/sha2.js";
import { bech32 } from "@scure/base";

/**
 * Direct-Lightning settlement-rail seam (ADR 0015).
 *
 * The buyer flow talks to the seller's Lightning Address through
 * the LightningClient interface defined below. Two implementations
 * live in this file:
 *
 *   - RealLightningClient: hits the seller's `<domain>/.well-known/
 *     lnurlp/<local-part>` endpoint, the LNURL-pay callback, and the
 *     LUD-21 verify URL. This is the only runtime path —
 *     `getLightningClient()` always returns this.
 *   - MockLightningClient: deterministic, in-process, no network.
 *     Test-only; tests opt in by calling
 *     `_setLightningClientForTests(new MockLightningClient())`. Not
 *     reachable through the factory and not used by `npm run dev`.
 *
 * LUD-21 (`verify` URL) is required. We refuse to mint an invoice
 * against a Lightning Address whose LNURL-pay endpoint does not
 * advertise LUD-21, because without `verify` we have no server-side
 * way to confirm the BOLT11 was paid — the seller's wallet is the
 * only thing that knows, and the seller did not give us NWC
 * credentials. Almost every modern provider (WoS, Strike, Alby Hub,
 * LNbits, ZBD, Primal) supports LUD-21.
 */

// --- Public types ------------------------------------------------

export interface LightningAddressMetadata {
  /** LNURL-pay callback URL the client GETs to mint an invoice. */
  callback: string;
  /** Minimum amount the address accepts, in millisats. */
  minSendable: number;
  /** Maximum amount the address accepts, in millisats. */
  maxSendable: number;
}

export interface MintedInvoice {
  bolt11: string;
  /** Hex-encoded 32-byte payment hash. May be derived from the BOLT11. */
  payment_hash: string;
  amount_sats: number;
  /** Unix seconds. */
  expires_at: number;
  /** LUD-21 verify URL the status poller GETs. */
  verify_url: string;
}

export interface VerifyState {
  settled: boolean;
  /** Hex-encoded 32-byte preimage when the wallet returns it; null otherwise. */
  preimage: string | null;
}

/**
 * Reasons mintInvoice can fail. Surfaced as an error code so the
 * settings sanity check + checkout API can give targeted feedback
 * (e.g. "your provider does not support LUD-21" vs. "we could not
 * reach your provider").
 */
export type LightningMintErrorCode =
  | "invalid_address"
  | "lnurl_unreachable"
  | "lnurl_invalid_response"
  | "lnurl_no_lud21"
  | "bolt11_no_payment_hash";

export class LightningMintError extends Error {
  constructor(
    public readonly code: LightningMintErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "LightningMintError";
  }
}

export interface LightningClient {
  resolveAddress(address: string): Promise<LightningAddressMetadata>;
  mintInvoice(
    address: string,
    amount_sats: number,
    comment?: string
  ): Promise<MintedInvoice>;
  pollVerify(verify_url: string): Promise<VerifyState>;
}

// --- Lightning Address parsing -----------------------------------

const LN_ADDRESS_RE = /^([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/;

export function parseLightningAddress(
  address: string
): { localPart: string; domain: string } | null {
  if (typeof address !== "string") return null;
  if (address.length === 0 || address.length > 128) return null;
  const m = LN_ADDRESS_RE.exec(address.trim());
  if (!m) return null;
  return { localPart: m[1], domain: m[2].toLowerCase() };
}

// --- SSRF guard --------------------------------------------------

/**
 * Asserts a URL is safe to fetch from a server route on behalf of
 * an outside-controlled value (LNURL-pay metadata callback URL,
 * LUD-21 verify URL). Two concerns:
 *
 *   1. The seller pastes their LN address; everything fetched
 *      downstream of that string is partially attacker-controlled
 *      (the seller's chosen LN provider can return arbitrary
 *      callback / verify URLs in its responses).
 *   2. A seller could deliberately or accidentally point at an
 *      internal service (loopback, RFC1918, link-local, cloud
 *      metadata). The body shape mismatch would make the response
 *      unusable, but the GET still happens, leaking timing or
 *      triggering side effects on the internal target.
 *
 * Defense:
 *   - Only `https:` is accepted. No `http:`, no `file:`, no `data:`.
 *   - Hostname must not be loopback (`localhost`, `127.x`, `::1`,
 *     `0.0.0.0`), link-local (`169.254.x` — also AWS metadata),
 *     RFC1918 private (`10.x`, `172.16-31.x`, `192.168.x`), or any
 *     IPv6 ULA (`fc00::/7`).
 *   - Hostname must contain a dot (rules out single-label names).
 *
 * NOT defended: DNS rebinding (a public domain that resolves to a
 * private IP at fetch time). For Cursats's threat model this is
 * acceptable — the seller controls their own LN provider; if
 * they point Cursats at a malicious provider that DNS-rebinds, they
 * can extract data from their own deployment but cannot reach
 * other sellers or shared platform services. Hardening to fully
 * defeat rebinding requires resolving the hostname ourselves and
 * fetching by IP, which we defer.
 */
export function assertSafePublicHttpsUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new LightningMintError("lnurl_invalid_response", `bad_url: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new LightningMintError(
      "lnurl_invalid_response",
      `non_https: ${parsed.protocol}`
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || !hostname.includes(".")) {
    throw new LightningMintError(
      "lnurl_invalid_response",
      `bare_hostname: ${hostname}`
    );
  }
  if (isPrivateOrLocalHost(hostname)) {
    throw new LightningMintError(
      "lnurl_invalid_response",
      `private_host: ${hostname}`
    );
  }
  return parsed;
}

// Exported so the NWC relay guard (lib/nwc.ts) can reuse the same
// private/local-host detection without duplicating the RFC1918 logic.
export function isPrivateOrLocalHost(hostname: string): boolean {
  // Hostname literals
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "metadata" || hostname === "metadata.google.internal") {
    return true;
  }
  // IPv4 literal (best-effort; bracketed IPv6 is handled separately by URL parser).
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (v4) {
    const [, a, b] = v4;
    const o1 = Number(a);
    const o2 = Number(b);
    if (o1 === 127) return true; // loopback
    if (o1 === 0) return true; // 0.0.0.0/8
    if (o1 === 10) return true; // RFC1918
    if (o1 === 169 && o2 === 254) return true; // link-local + AWS metadata
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // RFC1918
    if (o1 === 192 && o2 === 168) return true; // RFC1918
    return false;
  }
  // IPv6 literal — URL.hostname strips brackets.
  if (hostname.includes(":")) {
    if (hostname === "::1") return true;
    if (hostname === "::") return true;
    // ULA (fc00::/7) and link-local (fe80::/10).
    if (/^fc[0-9a-f]{2}:/i.test(hostname)) return true;
    if (/^fd[0-9a-f]{2}:/i.test(hostname)) return true;
    if (/^fe[89ab][0-9a-f]:/i.test(hostname)) return true;
  }
  return false;
}

// --- BOLT11 helpers ----------------------------------------------

/**
 * Extract the payment hash (hex) from a BOLT11 invoice. Some LNURL-pay
 * providers omit `payment_hash` from the callback response; this lets
 * us recover it from the invoice itself.
 *
 * Ported from bitbybit-habits/lib/lightning.ts. bech32 decode, walk
 * the tagged-fields section to find tag 1 (`p` = payment hash, 32
 * bytes / 256 bits encoded as 52 five-bit words).
 */
export function extractPaymentHash(invoice: string): string | null {
  try {
    const { words } = bech32.decode(invoice as `${string}1${string}`, 2000);

    // Skip 7 timestamp words; stop before the last 104 signature words.
    let pos = 7;
    while (pos < words.length - 104) {
      const type = words[pos];
      const dataLen = (words[pos + 1] << 5) | words[pos + 2];
      pos += 3;

      if (type === 1 && dataLen === 52) {
        const hashWords = words.slice(pos, pos + dataLen);
        const hashBytes = bech32.fromWords(hashWords);
        return Buffer.from(hashBytes).toString("hex");
      }

      pos += dataLen;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify a payment preimage against an expected payment_hash. Used by
 * the WebLN-pay path where the buyer's wallet hands us the preimage
 * after settling — we hash it and compare.
 */
export function verifyPreimage(
  preimage: string,
  payment_hash: string
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(preimage)) return false;
  if (!/^[0-9a-f]{64}$/i.test(payment_hash)) return false;
  const bytes = Buffer.from(preimage, "hex");
  const hash = sha256(bytes);
  const hashHex = Buffer.from(hash).toString("hex");
  return hashHex.toLowerCase() === payment_hash.toLowerCase();
}

// --- Mock --------------------------------------------------------

const MOCK_LNURL_TTL_SECONDS = 600;

interface MockMintRecord {
  bolt11: string;
  payment_hash: string;
  amount_sats: number;
  verify_url: string;
}

/**
 * Deterministic mock for dev and integration tests. `resolveAddress`
 * always returns metadata advertising LUD-21 except for a few
 * deliberately-broken addresses (used in tests):
 *
 *   - `nolud21@example.invalid` — returns allowsLud21: false
 *   - `bogus@example.invalid` — throws
 *
 * `markPaid(verify_url)` is the test-only helper that simulates the
 * seller's wallet receiving the funds — call it from a test before
 * polling.
 */
export class MockLightningClient implements LightningClient {
  private readonly invoices = new Map<string, MockMintRecord>();
  private readonly settled = new Set<string>();
  private mintCounter = 0;

  async resolveAddress(address: string): Promise<LightningAddressMetadata> {
    const parsed = parseLightningAddress(address);
    if (!parsed) {
      throw new LightningMintError("invalid_address", address);
    }
    if (parsed.domain === "example.invalid" && parsed.localPart === "bogus") {
      throw new LightningMintError("lnurl_unreachable", address);
    }
    return {
      callback: `https://${parsed.domain}/.well-known/lnurlp/${parsed.localPart}/callback`,
      minSendable: 1000,
      maxSendable: 100_000_000_000,
    };
  }

  async mintInvoice(
    address: string,
    amount_sats: number,
    comment?: string
  ): Promise<MintedInvoice> {
    const parsed = parseLightningAddress(address);
    if (!parsed) {
      throw new LightningMintError("invalid_address", address);
    }
    if (parsed.domain === "example.invalid") {
      if (parsed.localPart === "bogus") {
        throw new LightningMintError("lnurl_unreachable", address);
      }
      if (parsed.localPart === "nolud21") {
        throw new LightningMintError("lnurl_no_lud21", address);
      }
    }
    this.mintCounter += 1;
    const idx = this.mintCounter;
    // 32-byte hex padding so length matches a real payment_hash.
    const payment_hash = idx.toString(16).padStart(64, "0");
    const verify_url = `https://mock.lnurl/verify/${payment_hash}`;
    const bolt11 = `lnbc${amount_sats}n1mock${payment_hash.slice(0, 32)}`;
    const record: MockMintRecord = {
      bolt11,
      payment_hash,
      amount_sats,
      verify_url,
    };
    this.invoices.set(verify_url, record);
    void comment;
    return {
      bolt11,
      payment_hash,
      amount_sats,
      expires_at: Math.floor(Date.now() / 1000) + MOCK_LNURL_TTL_SECONDS,
      verify_url,
    };
  }

  async pollVerify(verify_url: string): Promise<VerifyState> {
    if (!this.invoices.has(verify_url)) {
      // Verify URLs we did not mint always return unsettled — refuses
      // to leak any cross-test state.
      return { settled: false, preimage: null };
    }
    if (this.settled.has(verify_url)) {
      // Deterministic preimage: the SHA256 of payment_hash bytes.
      // Tests should not assert on this value, only on `settled`.
      return {
        settled: true,
        preimage: "00".repeat(32),
      };
    }
    return { settled: false, preimage: null };
  }

  /**
   * Test/dev-only helper: mark a previously minted invoice as paid by
   * the seller's wallet. The next `pollVerify(verify_url)` returns
   * `{ settled: true }`.
   */
  markPaid(verify_url: string): void {
    if (!this.invoices.has(verify_url)) {
      throw new Error(`mock_unknown_verify_url: ${verify_url}`);
    }
    this.settled.add(verify_url);
  }
}

// --- Real client (LNURL-pay over fetch) --------------------------

const LNURL_FETCH_TIMEOUT_MS = 6_000;

class RealLightningClient implements LightningClient {
  async resolveAddress(address: string): Promise<LightningAddressMetadata> {
    const parsed = parseLightningAddress(address);
    if (!parsed) {
      throw new LightningMintError("invalid_address", address);
    }
    const url = `https://${parsed.domain}/.well-known/lnurlp/${parsed.localPart}`;
    // SSRF guard before the first hop. The domain came from user
    // input (the seller's pasted LN address), so it could resolve
    // a literal private host like `127.0.0.1.nip.io` even though
    // parseLightningAddress accepted the shape.
    assertSafePublicHttpsUrl(url);
    let meta: unknown;
    try {
      meta = await fetchJsonWithTimeout(url, LNURL_FETCH_TIMEOUT_MS);
    } catch {
      throw new LightningMintError("lnurl_unreachable", address);
    }
    if (
      typeof meta !== "object" ||
      meta === null ||
      typeof (meta as Record<string, unknown>).callback !== "string"
    ) {
      throw new LightningMintError("lnurl_invalid_response", address);
    }
    const m = meta as {
      callback: string;
      minSendable?: number;
      maxSendable?: number;
    };
    return {
      callback: m.callback,
      minSendable: Number(m.minSendable ?? 1000),
      maxSendable: Number(m.maxSendable ?? 100_000_000_000),
    };
  }

  async mintInvoice(
    address: string,
    amount_sats: number,
    comment?: string
  ): Promise<MintedInvoice> {
    const meta = await this.resolveAddress(address);
    const amount_msat = amount_sats * 1000;
    // Validate amount against the provider's advertised range
    // before we burn a network round-trip on a guaranteed reject.
    if (amount_msat < meta.minSendable || amount_msat > meta.maxSendable) {
      throw new LightningMintError("lnurl_invalid_response", address);
    }
    // SSRF guard on the callback URL (provider-controlled). A
    // malicious LN address could point its callback at
    // `https://10.0.0.5/internal-service` and we'd otherwise GET it.
    const url = assertSafePublicHttpsUrl(meta.callback);
    url.searchParams.set("amount", amount_msat.toString());
    if (comment) {
      // Most providers clamp comments at ~144–200 chars and reject
      // anything longer.
      url.searchParams.set("comment", comment.slice(0, 200));
    }
    let body: unknown;
    try {
      body = await fetchJsonWithTimeout(url.toString(), LNURL_FETCH_TIMEOUT_MS);
    } catch {
      throw new LightningMintError("lnurl_unreachable", address);
    }
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as Record<string, unknown>).pr !== "string"
    ) {
      throw new LightningMintError("lnurl_invalid_response", address);
    }
    const r = body as { pr: string; verify?: string };
    // LUD-21 gate. The metadata response is not a reliable place to
    // probe for `verify`; only the callback response is. We refuse
    // to mint against a provider that does not return one because
    // we have no other server-side way to confirm settlement.
    if (typeof r.verify !== "string" || r.verify.length === 0) {
      throw new LightningMintError("lnurl_no_lud21", address);
    }
    // SSRF guard on the verify URL (provider-controlled, third
    // hop). pollVerify will re-validate at request time, but
    // catching it here means we never persist a bad URL to the
    // order row.
    assertSafePublicHttpsUrl(r.verify);
    const payment_hash = extractPaymentHash(r.pr);
    if (!payment_hash) {
      throw new LightningMintError("bolt11_no_payment_hash", address);
    }
    return {
      bolt11: r.pr,
      payment_hash,
      amount_sats,
      // Most providers return invoices that expire ~10 min from issue.
      // We do not parse the BOLT11 expiry; the buyer page polls until
      // the seller's verify URL flips and we do not auto-remint.
      expires_at: Math.floor(Date.now() / 1000) + 600,
      verify_url: r.verify,
    };
  }

  async pollVerify(verify_url: string): Promise<VerifyState> {
    // SSRF guard before each verify request. Same URL was guarded
    // at mint time, but defense-in-depth: if a stored row was
    // populated before this guard existed (or by a buggy code
    // path), we still refuse to fetch internal targets.
    try {
      assertSafePublicHttpsUrl(verify_url);
    } catch {
      return { settled: false, preimage: null };
    }
    let body: unknown;
    try {
      body = await fetchJsonWithTimeout(verify_url, LNURL_FETCH_TIMEOUT_MS);
    } catch {
      // A transient failure must NOT mark the order paid. Treat it
      // as "not settled yet" and let the buyer page poll again.
      return { settled: false, preimage: null };
    }
    if (typeof body !== "object" || body === null) {
      return { settled: false, preimage: null };
    }
    const r = body as { settled?: boolean; preimage?: string | null };
    return {
      settled: Boolean(r.settled),
      preimage: typeof r.preimage === "string" ? r.preimage : null,
    };
  }
}

// LNURL responses (well-known metadata, callback, LUD-21 verify) are
// all small JSON envelopes — a few hundred bytes in practice. Cap the
// read at 64 KiB so a malicious or compromised provider can't return
// gigabytes and OOM the worker. The timeout above protects against
// slow-loris; this protects against fast-but-huge.
const MAX_LNURL_RESPONSE_BYTES = 64 * 1024;

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number
): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`fetch_${res.status}: ${url}`);
    }
    // Reject obviously-oversized responses by the advertised
    // Content-Length first; not all providers send it, so the
    // streaming counter below is the real guard.
    const advertised = res.headers.get("content-length");
    if (advertised && Number(advertised) > MAX_LNURL_RESPONSE_BYTES) {
      ctl.abort();
      throw new Error(`fetch_oversize: ${url}`);
    }
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error(`fetch_no_body: ${url}`);
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > MAX_LNURL_RESPONSE_BYTES) {
          // Best-effort: cancel the underlying stream so the
          // provider stops sending. Throw before we accumulate
          // beyond the cap into the chunks array.
          await reader.cancel().catch(() => {});
          throw new Error(`fetch_oversize: ${url}`);
        }
        chunks.push(value);
      }
    }
    const text = new TextDecoder("utf-8").decode(
      chunks.length === 1 ? chunks[0] : concatChunks(chunks, received)
    );
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// --- Factory -----------------------------------------------------

let cached: LightningClient | null = null;

/**
 * Reset the cached client. Test-only.
 */
export function _resetLightningClientForTests(): void {
  cached = null;
}

/**
 * Test-only helper to inject a specific client (typically a
 * MockLightningClient with pre-seeded markPaid state). The factory
 * always returns RealLightningClient otherwise, so tests that want
 * deterministic behaviour must call this before exercising any code
 * path that funds or polls a direct_lightning order.
 */
export function _setLightningClientForTests(client: LightningClient): void {
  cached = client;
}

export function getLightningClient(): LightningClient {
  if (cached) return cached;
  cached = new RealLightningClient();
  return cached;
}
