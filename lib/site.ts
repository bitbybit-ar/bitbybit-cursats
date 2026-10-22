import type { Locale } from "@/lib/schemas/auth";

/**
 * Hardcoded site identity. Edited by the developer who forks the
 * repo, never edited at runtime. Decision in ADR 0010 — branding/
 * identity stay in code; offerings + payment destination +
 * autorenewal toggle live in Postgres and are panel-editable.
 *
 * Renamed from `MERCHANT` in ADR 0016 to reflect that this is the
 * deployment-wide brand identity, not a per-user row in the
 * (now-renamed) `users` table.
 *
 * Update the values below for each fork. The shape is intentionally
 * narrow: anything that grows beyond identity probably belongs in
 * `messages/{es,en}.json` (copy) or `styles/_theme.scss` (visuals).
 */
export interface SiteIdentity {
  /** Human-readable name shown in titles and OG tags. */
  name: string;
  /** Public host (no scheme, no path). The one source for `SITE_URL`. */
  domain: string;
  /** Default locale shown to the buyer when there is no Accept-Language match. */
  default_locale: Locale;
  /** Optional links shown in the footer. Omit to hide. */
  social: {
    nostr_npub?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
  };
}

export const SITE: SiteIdentity = {
  name: "BitByBit Cursats",
  domain: "cursats.bitbybit.com.ar",
  default_locale: "es",
  social: {},
};

/**
 * Absolute origin for every canonical, hreflang, sitemap, robots,
 * Open Graph, JSON-LD and share link. Derived from code rather than an
 * env var so a per-environment value can never point search engines at
 * another host.
 */
export const SITE_URL = `https://${SITE.domain}`;
