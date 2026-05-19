"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe: returns `false` on the
 * server and the first client render (so hydration matches), then
 * reconciles to the real value on mount and on every change.
 *
 * Used by the How It Works ambient bubble field to drop the bubble
 * count on small screens without rendering the desktop nodes first.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
