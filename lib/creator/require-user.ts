import { type NextResponse } from "next/server";
import { getSession, type AuthSession } from "@/lib/auth";
import { ensureUserForPubkey, type User } from "@/lib/creator/users";

/**
 * Read the current session and look up (or lazily create) its user
 * row.
 *
 * Used by every `/api/settings/*` route. Per ADR 0014, the user row
 * is no longer a gate — any signed-in user gets one. The two
 * failure modes are:
 *
 *   - no session            → 401 `unauthorized`
 *   - session, deactivated  → 404 `user_inactive` — the platform
 *                              operator deactivated this user; the
 *                              surface is not advertised.
 */
export async function requireUser(): Promise<
  | { ok: true; session: AuthSession; user: User }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    const { NextResponse } = await import("next/server");
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const user = await ensureUserForPubkey(session.pubkey);
  if (!user.active) {
    const { NextResponse } = await import("next/server");
    return {
      ok: false,
      response: NextResponse.json({ error: "user_inactive" }, { status: 404 }),
    };
  }
  return { ok: true, session, user };
}
