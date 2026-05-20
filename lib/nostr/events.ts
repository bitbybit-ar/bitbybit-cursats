import type { Kind0Profile } from "./profile";
import type { UnsignedNostrEvent } from "./types";

/**
 * Build a plain kind:1 short text note (NIP-01). Used by the
 * "Share on Nostr" popup after a seller creates a course — the
 * content is whatever the seller typed into the textarea, no
 * e/p/imeta tagging.
 */
export function buildNoteEvent(content: string): UnsignedNostrEvent {
  return {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content,
  };
}

/**
 * Build a kind:0 profile metadata event (NIP-01). Used by the
 * settings page's "Publish to Nostr" button. The caller is
 * responsible for merging the form values on top of the user's
 * latest kind:0 fetched from relays — fields the form doesn't
 * manage (nip05, website, etc.) should stay intact, not blanked
 * out by overwriting with a sparse object. Pass a complete
 * `Kind0Profile` here and the JSON-encoded content carries
 * exactly those keys.
 */
export function buildProfileMetadataEvent(
  metadata: Kind0Profile
): UnsignedNostrEvent {
  // Strip undefined values so consumers don't see `"foo": undefined`
  // in the JSON (which JSON.stringify already drops, but being
  // explicit lets a future reader know we considered the case).
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (typeof v === "string" && v.length > 0) clean[k] = v;
  }
  return {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(clean),
  };
}
