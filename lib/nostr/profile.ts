import "server-only";
import { SimplePool } from "nostr-tools/pool";
import { PUBLIC_RELAYS } from "@/lib/nostr/relays";

/**
 * Server-side kind:0 profile fetch. Used at sign-in to pre-populate
 * the user row with the caller's existing Nostr identity (display
 * name, picture) instead of placeholder values. ADR 0014 — auto-create
 * with kind:0 metadata at sign-in.
 *
 * Best-effort. If the relay set is slow or has nothing for this
 * pubkey, returns an empty profile and the caller falls back to
 * placeholders. We never fail sign-in over a missing kind:0.
 */

export interface Kind0Profile {
  display_name?: string;
  name?: string;
  picture?: string;
  about?: string;
  banner?: string;
  /** NIP-05 verified identifier, e.g. "alice@cursats.bitbybit.com.ar". */
  nip05?: string;
  /** Lightning Address (LUD-16), e.g. "alice@primal.net". */
  lud16?: string;
}

const QUERY_TIMEOUT_MS = 3_000;

function parseKind0(content: string): Kind0Profile {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const out: Kind0Profile = {};
    if (typeof parsed.display_name === "string") {
      out.display_name = parsed.display_name;
    }
    if (typeof parsed.name === "string") out.name = parsed.name;
    if (typeof parsed.picture === "string") out.picture = parsed.picture;
    if (typeof parsed.about === "string") out.about = parsed.about;
    if (typeof parsed.banner === "string") out.banner = parsed.banner;
    if (typeof parsed.nip05 === "string") out.nip05 = parsed.nip05;
    if (typeof parsed.lud16 === "string") out.lud16 = parsed.lud16;
    return out;
  } catch {
    return {};
  }
}

export async function fetchKind0Profile(pubkey: string): Promise<Kind0Profile> {
  const pool = new SimplePool();
  try {
    const event = await pool.get(
      [...PUBLIC_RELAYS],
      { kinds: [0], authors: [pubkey] },
      { maxWait: QUERY_TIMEOUT_MS }
    );
    if (!event) return {};
    return parseKind0(event.content);
  } catch {
    return {};
  } finally {
    pool.close([...PUBLIC_RELAYS]);
  }
}
