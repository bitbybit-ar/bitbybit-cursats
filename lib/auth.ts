import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAuthSecret } from "@/lib/env";
import {
  SESSION_COOKIE_NAME,
  SESSION_INACTIVITY_MINUTES,
} from "@/lib/auth-constants";
import {
  LocaleSchema,
  SignerTypeSchema,
  type Locale,
  type SignerType,
} from "@/lib/schemas/auth";

export { SESSION_COOKIE_NAME };

const SESSION_DURATION = `${SESSION_INACTIVITY_MINUTES}m` as const;

/**
 * The session payload that lives inside the signed JWT cookie.
 *
 * Notice what is *not* here:
 *
 * - There is no user id, display name, or avatar embedded in the
 *   JWT — the pubkey IS the identity (ADR 0007). The `users` row
 *   (ADR 0016) is looked up at request time via
 *   `lib/creator/users.getUserByPubkey`, so deactivating a user
 *   revokes their access immediately without waiting for the JWT
 *   to expire.
 */
export interface AuthSession {
  pubkey: string;
  locale: Locale;
  /** null when the JWT was issued before signer_type was tracked. */
  signer_type: SignerType | null;
}

interface SessionPayload {
  pubkey: string;
  locale: Locale;
  signer_type?: SignerType | null;
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getAuthSecret());
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return verifySessionToken(token);
}

/**
 * Has-cookie / verified-session probe. Lets the layout and the
 * `/api/auth/session` route both detect the "cookie present but
 * JWT no longer verifies" state so they can drop the stale cookie
 * instead of leaving the browser to keep sending it on every
 * request until natural expiry.
 */
export async function readSessionCookieAndVerify(): Promise<{
  hasCookie: boolean;
  session: AuthSession | null;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { hasCookie: false, session: null };
  const session = await verifySessionToken(token);
  return { hasCookie: true, session };
}

/**
 * Pure JWT verification — no `next/headers` dependency. Lets the
 * `/panel` middleware (edge runtime) reuse the same logic without
 * dragging in cookies(), and makes the unit tests trivial.
 */
export async function verifySessionToken(
  token: string
): Promise<AuthSession | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    const p = payload as unknown as SessionPayload;
    if (!p.pubkey) return null;
    const locale = LocaleSchema.safeParse(p.locale).success
      ? (p.locale as Locale)
      : "es";
    const signerType =
      p.signer_type && SignerTypeSchema.safeParse(p.signer_type).success
        ? p.signer_type
        : null;
    return { pubkey: p.pubkey, locale, signer_type: signerType };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
