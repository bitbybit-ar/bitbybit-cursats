import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateNip98AuthEvent } from "@/lib/nostr/verify";
import { parseNostrAuthHeader } from "@/lib/nostr/http-auth";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  LocaleSchema,
  SignerTypeSchema,
  type Locale,
  type SignerType,
} from "@/lib/schemas/auth";
import { SESSION_INACTIVITY_MINUTES } from "@/lib/auth-constants";
import { fetchKind0Profile } from "@/lib/nostr/profile";
import {
  ensureUserForPubkey,
  refreshUserFromKind0,
} from "@/lib/creator/users";

/**
 * NIP-98 (HTTP Auth) login.
 *
 * The request carries the signed event in the `Authorization` header,
 * base64-encoded per the spec:
 *
 *     Authorization: Nostr <base64(JSON.stringify(event))>
 *
 * No challenge cookie, no GET round-trip. Replay protection comes
 * from:
 *   - the `u` tag binding the event to this exact URL
 *   - the `method` tag binding it to POST
 *   - the ±30s `created_at` window (validateNip98AuthEvent)
 *
 * The signer method (extension / nsec / nip46) and the buyer's
 * locale travel in custom `["cursats_signer", ...]` and
 * `["cursats_locale", ...]` tags so they are part of the signed
 * envelope — a man-in-the-middle cannot forge a different value
 * onto a captured event without invalidating the signature.
 */

const SIGNER_TAG = "cursats_signer";
const LOCALE_TAG = "cursats_locale";

const PARSE_FAILURE_CODES = {
  missing: "auth_missing_header",
  scheme: "auth_invalid_scheme",
  base64: "auth_invalid_base64",
  json: "auth_invalid_base64",
} as const;

function readTag(
  tags: ReadonlyArray<ReadonlyArray<string>>,
  name: string
): string | undefined {
  return tags.find((t) => t[0] === name)?.[1];
}

function readSignerType(
  tags: ReadonlyArray<ReadonlyArray<string>>
): SignerType | null {
  const raw = readTag(tags, SIGNER_TAG);
  if (!raw) return null;
  const parsed = SignerTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function readLocale(tags: ReadonlyArray<ReadonlyArray<string>>): Locale {
  const raw = readTag(tags, LOCALE_TAG);
  if (!raw) return "es";
  const parsed = LocaleSchema.safeParse(raw);
  return parsed.success ? parsed.data : "es";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const parsed = parseNostrAuthHeader(req.headers.get("authorization"));
  if (!parsed.ok) {
    return NextResponse.json(
      { error: PARSE_FAILURE_CODES[parsed.reason] },
      { status: 400 }
    );
  }
  const signedEvent = parsed.event;

  const validation = validateNip98AuthEvent(signedEvent, {
    url: req.nextUrl.toString(),
    method: req.method,
  });
  if (!validation.ok) {
    // Clock skew gets its own code so the client can show the
    // user-actionable "sync your device's time" message instead of
    // a generic signature error.
    if (validation.reason === "clock") {
      return NextResponse.json({ error: "auth_clock_skew" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "auth_invalid_signature", reason: validation.reason },
      { status: 400 }
    );
  }

  const event = validation.event;
  const pubkey = event.pubkey;
  const signerType = readSignerType(event.tags);
  // The locale carried in the signed envelope — the one the user is
  // looking at as they sign in. It seeds a *brand-new* row's default
  // language; for a returning user the stored preference wins below.
  const signinLocale = readLocale(event.tags);

  // Auto-create the user row at sign-in (ADRs 0014, 0016), seeded
  // from the user's kind:0 metadata when available so the storefront
  // /[slug] doesn't ship placeholder values. Best-effort: if the
  // relay set returns nothing in 3s, we fall back to the pubkey-
  // derived placeholder slug + display_name and the user can rename
  // from /settings later. Failures here are non-fatal — sign-in
  // proceeds even if the user insert errors (legacy sessions from
  // before this code can still hit lazy-create surfaces).
  //
  // `ensureUserForPubkey` seeds the row only on *creation*; a row first
  // created during a slow-relay sign-in keeps its placeholder
  // display_name forever otherwise (issue #30). So follow up with
  // `refreshUserFromKind0`, which fills placeholder/empty fields on the
  // existing row without clobbering anything the user has edited.
  //
  // The row's `locale` is the source of truth for the user's preferred
  // language (ADR 0021): seed it from `signinLocale` on creation, then
  // read it back as the *effective* locale we apply to the session and
  // hand to the client to redirect to. A returning user who saved a
  // different preference in /settings is bounced to that preference,
  // not to whichever locale URL they happened to sign in from.
  let effectiveLocale: Locale = signinLocale;
  try {
    const profile = await fetchKind0Profile(pubkey);
    const user = await ensureUserForPubkey(pubkey, {
      display_name: profile.display_name ?? profile.name,
      avatar_url: profile.picture,
      banner_url: profile.banner,
      bio: profile.about,
      nostr_lightning_address: profile.lud16,
      locale: signinLocale,
    });
    await refreshUserFromKind0(pubkey, profile);
    const stored = LocaleSchema.safeParse(user.locale);
    if (stored.success) effectiveLocale = stored.data;
  } catch (err) {
    console.warn(
      `[auth/nostr] ensureUserForPubkey failed for ${pubkey}:`,
      err instanceof Error ? err.message : err
    );
  }

  const token = await createSession({
    pubkey,
    locale: effectiveLocale,
    signer_type: signerType,
  });

  // sameSite: "strict" — Cursats auth is entirely client-side (NIP-07
  // extension, NIP-46 bunker, or pasted nsec). There is no OAuth
  // callback or partner-site form post that needs the looser "lax"
  // policy. Strict is the tighter default.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_INACTIVITY_MINUTES * 60,
    path: "/",
  });

  return NextResponse.json({
    pubkey,
    locale: effectiveLocale,
    signer_type: signerType,
  });
}
