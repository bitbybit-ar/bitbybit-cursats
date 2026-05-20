import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import {
  SESSION_COOKIE_NAME,
  SESSION_INACTIVITY_MINUTES,
} from "@/lib/auth-constants";
import { createSession, verifySessionToken } from "@/lib/auth";

const intlMiddleware = createMiddleware(routing);

// Creator-facing surfaces gated to signed-in users:
// /settings, /my-courses, /create-course, /orders, /purchases.
// Captures the non-default locale prefix so we can preserve it
// across the sign-in bounce; an undefined capture means Spanish.
const CREATOR_PATH_RE =
  /^(?:\/(en))?\/(?:settings|my-courses|create-course|orders|purchases)(?:\/.*)?$/;

// Legacy paths preserved as 308 redirects so bookmarks and external
// links keep working after the ADR 0014 + 0015 renames. Three
// generations are mapped:
//   pre-0014: /panel/{ofertas,pedidos,estudiantes,configuracion}
//   ADR 0014: /mis-cursos, /mis-ventas, /mis-estudiantes, /configuracion, /onboarding
//   ADR 0015 + final: /my-courses, /orders, /create-course, /purchases, /settings
const LEGACY_PATHS_RE =
  /^(?:\/(en))?\/(panel(?:\/.*)?|mis-cursos(?:\/.*)?|mis-ventas(?:\/.*)?|mis-estudiantes(?:\/.*)?|configuracion(?:\/.*)?|onboarding(?:\/.*)?|explorar(?:\/.*)?|iniciar-sesion(?:\/.*)?|gracias\/.*|reclamar\/.*)$/;

/**
 * Map a legacy pathname (without the locale prefix) to the new
 * canonical English path. Order matters: longer prefixes first so
 * `/mis-cursos/nueva` matches before `/mis-cursos`.
 */
function rewriteLegacyPath(subpath: string): string | null {
  const rewrites: Array<[RegExp, string]> = [
    // Pre-ADR-0014 panel namespace
    [/^\/panel\/configuracion(\/.*)?$/, "/settings$1"],
    [/^\/panel\/ofertas\/nueva$/, "/create-course"],
    [/^\/panel\/ofertas\/([^/]+)\/editar$/, "/my-courses/$1/edit"],
    [/^\/panel\/ofertas(\/.*)?$/, "/my-courses$1"],
    [/^\/panel\/pedidos(\/.*)?$/, "/orders$1"],
    [/^\/panel\/estudiantes(\/.*)?$/, "/orders"],
    [/^\/panel(\/.*)?$/, "/my-courses"],
    // ADR 0014 era — Spanish top-level
    [/^\/mis-cursos\/nueva$/, "/create-course"],
    [/^\/mis-cursos\/([^/]+)\/editar$/, "/my-courses/$1/edit"],
    [/^\/mis-cursos(\/.*)?$/, "/my-courses$1"],
    [/^\/mis-ventas(\/.*)?$/, "/orders$1"],
    [/^\/mis-estudiantes(\/.*)?$/, "/orders"],
    [/^\/configuracion(\/.*)?$/, "/settings$1"],
    [/^\/onboarding(\/.*)?$/, "/sign-in"],
    // Public-route Spanish → English (ADR 0015 final)
    [/^\/explorar(\/.*)?$/, "/explore$1"],
    [/^\/iniciar-sesion(\/.*)?$/, "/sign-in$1"],
    [/^\/gracias\/(.+)$/, "/receipt/$1"],
    [/^\/reclamar\/(.+)$/, "/claim/$1"],
  ];
  for (const [re, target] of rewrites) {
    if (re.test(subpath)) return subpath.replace(re, target);
  }
  return null;
}

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
 *   1. Redirect every legacy URL to its current canonical form so
 *      old bookmarks survive the renames. 308 preserves the method
 *      and tells search engines the move is permanent.
 *
 *   2. Gate creator-facing surfaces (/settings, /my-courses,
 *      /create-course, /orders, /purchases) to signed-in users.
 *      Anonymous visitors bounce to /sign-in preserving the
 *      original target via ?next=. The user-row check happens
 *      server-side in each page (via requirePanelUser); the edge
 *      gate just enforces "you must be signed in".
 *
 *   3. Everything else falls through to the next-intl locale
 *      middleware. Spanish is the default locale and is served
 *      unprefixed (`/`, `/foo`); English routes carry the `/en`
 *      prefix.
 *
 * The session check uses `verifySessionToken` (jose-only, no
 * `next/headers`) so this whole module runs on the edge runtime.
 */
export default async function proxy(
  request: NextRequest
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const isPrefetch = isPrefetchRequest(request);

  const legacyMatch = LEGACY_PATHS_RE.exec(pathname);
  if (legacyMatch) {
    const locale = legacyMatch[1] ?? routing.defaultLocale;
    const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    const subpath = pathname.slice(localePrefix.length);
    const target = rewriteLegacyPath(subpath);
    if (target) {
      const url = new URL(`${localePrefix}${target}`, request.url);
      url.search = request.nextUrl.search;
      return NextResponse.redirect(url, 308);
    }
  }

  const creatorMatch = CREATOR_PATH_RE.exec(pathname);
  // Skip the auth gate for prefetch: bouncing a prefetch to /sign-in
  // would poison the prefetch cache for a gated page. The real
  // (non-prefetch) navigation still hits this gate, and each page's
  // `requirePanelUser` is the server-side backstop.
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
      return redirect;
    }

    // Signed in — fall through. Each page's `requirePanelUser`
    // lazily creates the user row and 404s on deactivation.
  }

  const response = intlMiddleware(request);
  // Sliding-session refresh only on real navigations — a prefetch
  // must not emit a Set-Cookie that re-mints the inactivity clock.
  if (!isPrefetch) {
    await refreshOrClearSessionCookie(request, response);
  }
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
