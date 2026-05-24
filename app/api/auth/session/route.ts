import { NextResponse } from "next/server";
import {
  readSessionCookieAndVerify,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { getUserByPubkey } from "@/lib/creator/users";

export async function GET(): Promise<NextResponse> {
  const { hasCookie, session } = await readSessionCookieAndVerify();
  if (!session) {
    const res = NextResponse.json({ session: null });
    // Drop a stale cookie so the browser doesn't keep sending a
    // dead JWT on every request until its natural maxAge expires.
    // `hasCookie && !session` only happens when the cookie exists
    // but verifySessionToken rejected it (signature mismatch, exp
    // past, malformed payload).
    if (hasCookie) {
      res.cookies.delete(SESSION_COOKIE_NAME);
    }
    return res;
  }
  const user = await getUserByPubkey(session.pubkey);
  return NextResponse.json({
    session: {
      pubkey: session.pubkey,
      locale: session.locale,
      signer_type: session.signer_type,
      // Slim user payload: just enough for the client to decide
      // between "render the panel link" and "render onboarding CTA".
      // Profile reads happen server-side from the panel route.
      user:
        user && user.active
          ? {
              id: user.id,
              slug: user.slug,
              display_name: user.display_name,
            }
          : null,
    },
  });
}
