/**
 * Parser for the NIP-98 `Authorization: Nostr <base64>` header.
 *
 * Returns a discriminated result so callers can distinguish a missing
 * header (a normal "log in") from a malformed one (probably a
 * misconfigured client). Doing the JSON.parse here keeps the signed-
 * event shape opaque to the caller — `validateNip98AuthEvent` is
 * responsible for the schema check.
 */

export type NostrAuthParseFailure = "missing" | "scheme" | "base64" | "json";

export type NostrAuthParseResult =
  | { ok: true; event: unknown }
  | { ok: false; reason: NostrAuthParseFailure };

export function parseNostrAuthHeader(
  header: string | null
): NostrAuthParseResult {
  if (!header) return { ok: false, reason: "missing" };

  const [scheme, encoded] = header.split(/\s+/, 2);
  if (scheme !== "Nostr" || !encoded) {
    return { ok: false, reason: "scheme" };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return { ok: false, reason: "base64" };
  }

  try {
    return { ok: true, event: JSON.parse(decoded) };
  } catch {
    return { ok: false, reason: "json" };
  }
}
