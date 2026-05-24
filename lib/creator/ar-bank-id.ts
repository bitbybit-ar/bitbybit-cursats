/**
 * Validators for the Argentine identifiers a user types into the
 * creator surfaces (when they sell): bank alias, CBU, and the marketplace's
 * URL slug.
 *
 * Sources for the alias rule:
 *   - BCRA: https://www.bcra.gob.ar/MediosPago/Alias-CBU.asp
 *   - https://es.wikipedia.org/wiki/Clave_Bancaria_Uniforme
 *
 * BCRA's published format is **6–20 characters** drawn from
 *   `[A-Za-z0-9.-]`
 * — letters case-insensitive, plus digits, plus dots and hyphens.
 * No spaces or other symbols. The "three-words-divided-by-dots"
 * convention many banks suggest is *not* enforced by BCRA, so this
 * validator stays permissive on segmenting.
 *
 * One soft rule we do enforce: the alias must contain at least one
 * letter. That distinguishes it from a CBU/CVU paste in the alias
 * field (CBUs/CVUs are 22–23 digits) and matches the convention
 * several big banks use anyway.
 *
 * A CBU is 22 digits; a CVU (virtual account — Mercado Pago, Ualá,
 * etc.) is 23. Wapu settles ARS to both, so we accept either length.
 * We do not verify the check-digit algorithm here — Wapu will reject
 * a malformed account at create-payment time, and surfacing a generic
 * Wapu error is acceptable for the rare typo where the digits look
 * right but the checksum is off.
 */

import { z } from "zod";

const ALIAS_REGEX = /^[A-Za-z0-9.-]{6,20}$/;
const ALIAS_HAS_LETTER = /[A-Za-z]/;
const CBU_REGEX = /^\d{22,23}$/;

/**
 * Slug used in URLs (`/[slug]` since ADR 0017). Lowercase URL-safe,
 * hyphen-separated. We reject leading/trailing hyphens and consecutive
 * hyphens so the slug renders cleanly in nav copy and
 * breadcrumbs without a separate sanitizer.
 */
const USER_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const USER_SLUG_MIN = 3;
const USER_SLUG_MAX = 40;

export type AliasError = "format" | "length" | "no_letter";
export type CbuError = "format";
export type SlugError = "format" | "length" | "reserved";

/**
 * Slugs a user cannot claim. Public so callers that GENERATE
 * candidate slugs (e.g. lib/creator/users.ts when seeding from
 * kind:0 metadata) can avoid producing one that the validator
 * would later reject. A duplicated copy in the users module
 * would drift on every URL rename — single source of truth here.
 */
export const RESERVED_SLUGS = new Set([
  // Current English routes
  "settings",
  "my-courses",
  "create-course",
  "orders",
  "purchases",
  "explore",
  "sign-in",
  "receipt",
  "claim",
  "checkout",
  "how-it-works",
  "features",
  "faq",
  // Legacy paths still served via 308 redirects
  "panel",
  "onboarding",
  "iniciar-sesion",
  "mis-compras",
  "mis-cursos",
  "mis-ventas",
  "mis-estudiantes",
  "configuracion",
  "reclamar",
  "explorar",
  "gracias",
  // Reserved for system / framework
  "api",
  "c",
  "m",
  "admin",
  "_next",
  "favicon",
]);

/**
 * Returns `null` if the alias is valid, or a discriminated reason
 * suitable for an i18n key dispatch.
 */
export function checkAlias(input: string): AliasError | null {
  const trimmed = input.trim();
  if (trimmed.length < 6 || trimmed.length > 20) return "length";
  if (!ALIAS_REGEX.test(trimmed)) return "format";
  if (!ALIAS_HAS_LETTER.test(trimmed)) return "no_letter";
  return null;
}

export function checkCbu(input: string): CbuError | null {
  const trimmed = input.trim();
  if (!CBU_REGEX.test(trimmed)) return "format";
  return null;
}

export function checkUserSlug(input: string): SlugError | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length < USER_SLUG_MIN || trimmed.length > USER_SLUG_MAX) {
    return "length";
  }
  if (!USER_SLUG_REGEX.test(trimmed)) return "format";
  if (RESERVED_SLUGS.has(trimmed)) return "reserved";
  return null;
}

/**
 * Zod schemas for the three identifiers, used by the settings API
 * routes. Each refines on the relevant `check*` so the failure
 * code rides through Zod's `issues` array and is surface-able to
 * the form via the existing toast pattern.
 */
export const AliasSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => checkAlias(v) === null, {
    message: "alias_invalid",
  });

export const CbuSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => checkCbu(v) === null, { message: "cbu_invalid" });

export const UserSlugSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => checkUserSlug(v) === null, {
    message: "slug_invalid",
  });

/**
 * The seller's payout destination. They store either an alias
 * OR a CBU; we do not need both. The schema accepts either shape
 * and tags the kind so callers (Wapu integration) can decide
 * which they actually got.
 */
export type PayoutDestination =
  | { kind: "alias"; value: string }
  | { kind: "cbu"; value: string };

export function classifyPayoutDestination(
  raw: string
): PayoutDestination | null {
  const trimmed = raw.trim();
  if (checkCbu(trimmed) === null) return { kind: "cbu", value: trimmed };
  if (checkAlias(trimmed) === null) return { kind: "alias", value: trimmed };
  return null;
}

export const RESERVED_SLUG_LIST = Array.from(RESERVED_SLUGS).sort();
