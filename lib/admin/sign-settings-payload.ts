/**
 * Canonical signed-payload helpers for the settings PATCH.
 *
 * ADR 0008 requires payment-destination changes (CBU, alias) to be
 * confirmed by a NIP-07 re-sign. Client and server must agree on the
 * exact bytes that were signed, otherwise a re-serialization
 * difference (key order, whitespace) breaks the hash check. These
 * helpers centralize the canonical form so both sides hash and
 * authenticate the *same* bytes.
 */

import type { UnsignedNostrEvent } from "@/lib/nostr/types";

const NIP98_KIND = 27235;
const ACTION_TAG_VALUE = "settings.update";

/**
 * SHA-256 hex digest of the request body bytes.
 *
 * Caller MUST pass the exact string that travels as the request body
 * — pre-serialize once and hash that, then send the same string. If
 * the client computes the hash from a freshly-rebuilt object, key
 * ordering can drift between runtimes.
 */
export async function hashSettingsBody(serialized: string): Promise<string> {
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the unsigned NIP-98 event the client needs to feed the signer.
 *
 * Tags pinned:
 *   - `u`             — absolute URL of the PATCH endpoint
 *   - `method`        — "PATCH"
 *   - `payload`       — sha256 of the body (binds signature to bytes)
 *   - `cursats_action` — "settings.update" (binds signature to surface
 *                       so a captured event cannot be replayed against
 *                       a different signed-action endpoint added
 *                       later)
 */
export function buildSettingsAuthEvent(
  url: string,
  payloadHashHex: string,
  options: { method?: "PATCH" | "DELETE" } = {}
): UnsignedNostrEvent {
  return {
    kind: NIP98_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["u", url],
      ["method", options.method ?? "PATCH"],
      ["payload", payloadHashHex],
      ["cursats_action", ACTION_TAG_VALUE],
    ],
    content: "",
  };
}

export const SETTINGS_ACTION_TAG = ACTION_TAG_VALUE;
