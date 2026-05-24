import "server-only";
import { notFound } from "next/navigation";
import { getSession, type AuthSession } from "@/lib/auth";
import { ensureUserForPubkey, type User } from "@/lib/creator/users";

/**
 * Page-side counterpart of `requireUser` (the API helper). Used by
 * every creator-facing page (My courses, Settings, Orders) to scope
 * queries to the caller's user row.
 *
 * Per ADRs 0014 + 0016, the user row is just the server-side row
 * that owns offerings/orders for this pubkey. Any signed-in user
 * gets one lazily; deactivated users 404.
 *
 * Anonymous visitors are bounced upstream by the edge proxy; the
 * `notFound()` here is defence-in-depth.
 */
export async function requirePageUser(): Promise<{
  session: AuthSession;
  user: User;
}> {
  const session = await getSession();
  if (!session) notFound();
  const user = await ensureUserForPubkey(session.pubkey);
  if (!user.active) notFound();
  return { session, user };
}
