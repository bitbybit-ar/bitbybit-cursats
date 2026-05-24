import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import {
  SESSION_COOKIE_NAME,
  SESSION_INACTIVITY_MINUTES,
} from "@/lib/auth-constants";
import { createSession, verifySessionToken } from "@/lib/auth";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

const intlMiddleware = createMiddleware(routing);

// Creator-facing surfaces gated to signed-in users:
// /settings, /my-courses, /create-course, /orders, /purchases.
// Captures the non-default locale prefix so we can preserve it
// across the sign-in bounce; an undefined capture means Spanish.
const CREATOR_PATH_RE =
  /^(?:\/(en))?\/(?:settings|my-courses|create-course|orders|purchases)(?:\/.*)?$/;

/**
 * App Router prefetch requests still need the next-intl locale
 * rewrite. With `localePrefix: "as-needed"` the Spanish default is
 * served unprefixed and next-intl internally rewrites `/explore` →
 * `/es/explore` so the App Router can resolve `app/[locale]/explore`.
 * If prefetch requests skip that rewrite, `/explore` resolves with
 * `[locale]="explore"` and Next renders `app/[locale]/page.tsx` (the
 * landing page); the soft navigation then serves that poisoned
 * prefetch — the URL + navbar update client-side but the body stays
 * on the landing page, and offering-card RSC prefetches 404. So we
 * keep prefetch in the matcher and run the locale rewrite for it.
 * What we must NOT do on a prefetch is bounce it to /sign-in or
 * re-mint the session cookie — those are handled only for real
 * navigations below.
 */
function isPrefetchRequest(req: NextRequest): boolean {
  return (
    req.headers.get("next-router-prefetch") === "1" ||
    req.headers.get("purpose") === "prefetch" ||
    (req.headers.get("sec-purpose")?.includes("prefetch") ?? false)
  );
}

/**
 * Edge middleware.
 *
 * Three responsibilities:
 *
 *   1. Gate creator-facing surfaces (/settings, /my-courses,
 *      /create-course, /orders, /purchases) to signed-in users.
 *      Anonymous visitors bounce to /sign-in preserving the
 *      original target via ?next=. The user-row check happens
 *      server-side in each page (via requirePageUser); the edge
 *      gate just enforces "you must be signed in".
 *
 *   2. Everything else falls through to the next-intl locale
 *      middleware. Spanish is the default locale and is served
 *      unprefixed (`/`, `/foo`); English routes carry the `/en`
 *      prefix.
 *
 *   3. Set the per-request Content-Security-Policy. The nonce is
 *      minted here (production only) and threaded onto the *request*
 *      headers so Next.js stamps it on its own bootstrap/hydration
 *      scripts and the layout can stamp the JSON-LD + theme scripts;
 *      next-intl forwards those cloned request headers into its
 *      rewrite. The same policy is echoed on the response. CSP can't
 *      live in next.config.ts headers() because the nonce must be
 *      unique per request. Other security headers (HSTS, X-Frame-
 *      Options, …) stay static in next.config.ts.
 *
 * The session check uses `verifySessionToken` (jose-only, no
 * `next/headers`) so this whole module runs on the edge runtime.
 */
export default async function proxy(
  request: NextRequest
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const isPrefetch = isPrefetchRequest(request);

  // Mint the CSP nonce up front so every exit path (auth redirect,
  // locale rewrite, pass-through) carries the same policy. Dev keeps a
  // loose, nonce-less policy — see buildContentSecurityPolicy.
  const isProd = process.env.NODE_ENV === "production";
  const nonce = isProd ? generateNonce() : undefined;
  const csp = buildContentSecurityPolicy({ nonce, isDev: !isProd });
  if (nonce) {
    // Visible to the rendered request: Next reads the nonce from the
    // request CSP header; the layout reads x-nonce. next-intl clones
    // these via `new Headers(request.headers)` into its rewrite.
    request.headers.set("x-nonce", nonce);
    request.headers.set("content-security-policy", csp);
  }

  const creatorMatch = CREATOR_PATH_RE.exec(pathname);
  // Skip the auth gate for prefetch: bouncing a prefetch to /sign-in
  // would poison the prefetch cache for a gated page. The real
  // (non-prefetch) navigation still hits this gate, and each page's
  // `requirePageUser` is the server-side backstop.
  if (creatorMatch && !isPrefetch) {
    const locale = creatorMatch[1] ?? routing.defaultLocale;
    const session = await readSession(request);

    if (!session) {
      const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
      const url = new URL(`${localePrefix}/sign-in`, request.url);
      // Strip the locale prefix from `next` — the sign-in page
      // re-applies it via next-intl's locale-aware router.
      const targetPath =
        localePrefix && pathname.startsWith(localePrefix)
          ? pathname.slice(localePrefix.length) || "/my-courses"
          : pathname || "/my-courses";
      url.searchParams.set("next", targetPath);
      const redirect = NextResponse.redirect(url);
      // Drop a stale cookie if the browser is still sending one —
      // it has either expired or been signed with a rotated secret,
      // and keeping it makes every subsequent request burn the
      // verify path for nothing.
      if (request.cookies.has(SESSION_COOKIE_NAME)) {
        redirect.cookies.delete(SESSION_COOKIE_NAME);
      }
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }

    // Signed in — fall through. Each page's `requirePageUser`
    // lazily creates the user row and 404s on deactivation.
  }

  const response = intlMiddleware(request);
  // Sliding-session refresh only on real navigations — a prefetch
  // must not emit a Set-Cookie that re-mints the inactivity clock.
  if (!isPrefetch) {
    await refreshOrClearSessionCookie(request, response);
  }
  response.headers.set("content-security-policy", csp);
  return response;
}

async function readSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Sliding-session refresh + stale-cookie cleanup. Three branches:
 *
 *   - No cookie → nothing to do.
 *   - Cookie present, verifies → re-mint with a fresh inactivity
 *     clock so the next idle window starts from now.
 *   - Cookie present, verify fails → delete the cookie so the
 *     browser stops sending a dead JWT on every subsequent request.
 *
 * Re-issuing on every authenticated request adds one JWT sign call
 * per page navigation, which the edge runtime handles in well under
 * a millisecond. The Set-Cookie response header replaces the
 * existing cookie atomically.
 */
async function refreshOrClearSessionCookie(
  request: NextRequest,
  response: NextResponse
): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;
  const session = await verifySessionToken(token);
  if (!session) {
    response.cookies.delete(SESSION_COOKIE_NAME);
    return;
  }
  const fresh = await createSession({
    pubkey: session.pubkey,
    locale: session.locale,
    signer_type: session.signer_type,
  });
  response.cookies.set(SESSION_COOKIE_NAME, fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_INACTIVITY_MINUTES * 60,
    path: "/",
  });
}

export const config = {
  // Standard next-intl matcher. Prefetch requests are intentionally
  // INCLUDED (no `missing` clause) so the locale rewrite runs for
  // them — see `isPrefetchRequest` for why excluding prefetch broke
  // navigation. Auth-gate / cookie-refresh prefetch handling lives
  // in the handler, not the matcher.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
