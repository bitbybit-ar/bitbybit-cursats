// Client-side NIP-05 verification: resolve `<name>@<domain>` against
// the domain's `.well-known/nostr.json` and confirm it maps back to
// the expected pubkey. Returns `false` on any failure (network, CORS,
// parse, mismatch) so callers can treat "unverified" as the safe
// default. Ported from bitbybit-arena (`lib/nostr/nip05.ts`).

const NIP05_LIKE_RE = /^[^@\s]+(?:@[^@\s/]+)?$/;
const HEX_64_RE = /^[0-9a-f]{64}$/i;

export interface VerifyNip05Options {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function verifyNip05(
  nip05: string,
  expectedPubkey: string,
  options: VerifyNip05Options = {}
): Promise<boolean> {
  const trimmed = nip05.trim();
  if (!NIP05_LIKE_RE.test(trimmed)) return false;
  if (!HEX_64_RE.test(expectedPubkey)) return false;

  // A bare domain (no local part) verifies the root `_` name per NIP-05.
  const [rawLocal, rawDomain] = trimmed.includes("@")
    ? trimmed.split("@", 2)
    : ["_", trimmed];
  const localpart = rawLocal.toLowerCase();
  const domain = rawDomain?.toLowerCase();
  if (!localpart || !domain) return false;

  const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
    localpart
  )}`;
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      signal: options.signal,
      mode: "cors",
      credentials: "omit",
    });
  } catch {
    return false;
  }

  if (!response.ok) return false;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return false;
  }

  if (!body || typeof body !== "object") return false;
  const names = (body as { names?: Record<string, unknown> }).names;
  if (!names || typeof names !== "object") return false;
  const claimed = names[localpart];
  if (typeof claimed !== "string") return false;

  return claimed.toLowerCase() === expectedPubkey.toLowerCase();
}
