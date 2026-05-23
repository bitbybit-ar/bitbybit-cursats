"use client";

import { useEffect, useState } from "react";
import { SimplePool } from "nostr-tools/pool";
import { PUBLIC_RELAYS } from "@/lib/nostr/relays";

export interface NostrProfile {
  picture?: string;
  name?: string;
  display_name?: string;
  /** NIP-05 identifier (`name@domain`) advertised in kind:0. */
  nip05?: string;
  /** Lightning address (LUD-16) advertised in kind:0. */
  lud16?: string;
}

interface CacheEnvelope {
  data: NostrProfile | null;
  fetched_at: number;
}

const STORAGE_PREFIX = "cursats:nostr:profile:";
// Stale-while-revalidate window. Cached entries older than this still
// render immediately, but a background fetch refreshes them.
const FRESHNESS_MS = 24 * 60 * 60 * 1000;
const QUERY_TIMEOUT_MS = 4_000;

// Module-scoped to dedupe concurrent fetches for the same pubkey
// across remounts (navbar + mobile menu can both subscribe in the
// same render).
const inflight = new Map<string, Promise<NostrProfile | null>>();

function readCache(pubkey: string): CacheEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + pubkey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (typeof parsed?.fetched_at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(pubkey: string, data: NostrProfile | null) {
  if (typeof window === "undefined") return;
  try {
    const envelope: CacheEnvelope = { data, fetched_at: Date.now() };
    window.localStorage.setItem(
      STORAGE_PREFIX + pubkey,
      JSON.stringify(envelope)
    );
  } catch {
    // Quota / private-mode failures: cache is an optimization, not a
    // requirement. Drop the write silently.
  }
}

function parseProfileContent(content: string): NostrProfile | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const profile: NostrProfile = {};
    if (typeof parsed.picture === "string") profile.picture = parsed.picture;
    if (typeof parsed.name === "string") profile.name = parsed.name;
    if (typeof parsed.display_name === "string") {
      profile.display_name = parsed.display_name;
    }
    if (typeof parsed.nip05 === "string") profile.nip05 = parsed.nip05;
    if (typeof parsed.lud16 === "string") profile.lud16 = parsed.lud16;
    return profile;
  } catch {
    return null;
  }
}

async function fetchProfile(pubkey: string): Promise<NostrProfile | null> {
  const pool = new SimplePool();
  try {
    const event = await pool.get(
      [...PUBLIC_RELAYS],
      { kinds: [0], authors: [pubkey] },
      { maxWait: QUERY_TIMEOUT_MS }
    );
    if (!event) return null;
    return parseProfileContent(event.content);
  } catch {
    return null;
  } finally {
    pool.close([...PUBLIC_RELAYS]);
  }
}

function getOrFetch(pubkey: string): Promise<NostrProfile | null> {
  const existing = inflight.get(pubkey);
  if (existing) return existing;
  const promise = fetchProfile(pubkey).finally(() => {
    inflight.delete(pubkey);
  });
  inflight.set(pubkey, promise);
  return promise;
}

export interface UseNostrProfileResult {
  profile: NostrProfile | null;
  loading: boolean;
}

/**
 * Fetch a Nostr user's kind:0 profile metadata, caching results in
 * localStorage for 24h. Returns the cached value immediately on mount
 * (stale-while-revalidate) and refetches in the background when the
 * cache is stale or absent.
 *
 * Returns `{ profile: null, loading: false }` for a null pubkey so
 * callers can use the hook unconditionally.
 */
export function useNostrProfile(
  pubkey: string | null | undefined
): UseNostrProfileResult {
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pubkey) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cached = readCache(pubkey);

    if (cached) {
      setProfile(cached.data);
      const fresh = Date.now() - cached.fetched_at < FRESHNESS_MS;
      if (fresh) {
        setLoading(false);
        return;
      }
    } else {
      setProfile(null);
    }

    setLoading(true);
    getOrFetch(pubkey)
      .then((data) => {
        if (cancelled) return;
        writeCache(pubkey, data);
        setProfile(data);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  return { profile, loading };
}
