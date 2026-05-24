import { NextResponse } from "next/server";
import { requireUser } from "@/lib/creator/require-user";
import { fetchKind0Profile } from "@/lib/nostr/profile";

/**
 * "Sync from relays" — re-fetches the user's kind:0 profile from
 * the public relay set and returns the parsed fields. The settings
 * Profile panel uses this to refresh its form state with whatever
 * the user has published most recently on Nostr; the user reviews
 * the prefilled form and clicks Save to persist into the cursats
 * row.
 *
 * Keeps the relay fetch on the server side so the browser doesn't
 * need to spin up its own SimplePool. The function is best-effort
 * with a 3-second relay timeout (see `fetchKind0Profile`).
 */
export async function POST(): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const profile = await fetchKind0Profile(auth.session.pubkey);
  return NextResponse.json({ profile });
}
