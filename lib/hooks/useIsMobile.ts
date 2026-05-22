"use client";

import { useMediaQuery } from "./useMediaQuery";

/**
 * True on devices where a Nostr signer app (Amber, Primal, nsec.app,
 * …) can be launched directly via a `nostrconnect://` deep link —
 * i.e. phones/tablets with a coarse (touch) pointer.
 *
 * Used by the login flow to lead with the "open in signer app" path
 * and hide the desktop-only NIP-07 extension button: a coarse-pointer
 * device has no browser extension to call, but it can hand a
 * `nostrconnect://` URI straight to an installed signer.
 *
 * A touchscreen laptop also reports `coarse`, which is fine: the deep
 * link simply no-ops there and the QR + copy fallbacks remain.
 *
 * SSR-safe: returns `false` on the server and the first client render
 * (so hydration matches), then reconciles on mount.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
