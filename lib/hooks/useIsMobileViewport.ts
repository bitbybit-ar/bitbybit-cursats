"use client";

import { useMediaQuery } from "./useMediaQuery";

/**
 * True when the viewport is narrower than the mobile breakpoint
 * (`$breakpoint-mobile`, 768px) — i.e. the phone single-column layout
 * is active. Mirrors the SCSS `@include mobile` boundary
 * (`max-width: 767px`) exactly.
 *
 * Use this to gate *layout/animation* behaviour by viewport width, so
 * tablets and small laptops get the same treatment as desktop. It is
 * the width-based sibling of `useIsMobile`, which detects pointer type
 * (`pointer: coarse`) for *capability* decisions like signer-app deep
 * links and browser-extension availability — a touchscreen laptop is
 * "mobile" to `useIsMobile` but not to this hook.
 *
 * SSR-safe: returns `false` on the server and the first client render
 * (so hydration matches), then reconciles on mount.
 */
export function useIsMobileViewport(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
