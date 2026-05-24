import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
  UpdateUserProfileSchema,
  updateUserProfile,
  softDeleteUser,
} from "@/lib/creator/users";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { requireUser } from "@/lib/creator/require-user";
import { parseNostrAuthHeader } from "@/lib/nostr/http-auth";
import { validateNip98AuthEvent } from "@/lib/nostr/verify";
import { hashSettingsBody } from "@/lib/creator/sign-settings-payload";
import { getLightningClient, LightningMintError } from "@/lib/lightning";
import { decrypt } from "@/lib/crypto";
import { validateNwcConnection, NwcError } from "@/lib/nwc";

/**
 * Update the current user's profile (CBU, alias, Lightning Address,
 * payout method, autorenewal toggle). Marketplace edition (ADRs
 * 0012, 0016) — the deployment-wide `settings` singleton is gone;
 * this route writes to the caller's `users` row.
 *
 * ADR 0008's NIP-07 re-sign requirement carries over to all
 * payment-destination fields. Per ADR 0015, that now includes
 * `lightning_address` and `payout_method` in addition to cbu/alias.
 * Any change to these requires a NIP-98 kind:27235 signature whose
 * `payload` tag binds to the request body's sha256 and whose
 * pubkey equals the session pubkey.
 *
 * When the user sets/changes their `lightning_address` and the
 * sats rail is selected (or about to be), we mint a 1-sat probe
 * invoice via lib/lightning to confirm the upstream provider
 * advertises LUD-21 (the `verify` URL on its callback response).
 * Providers without LUD-21 are rejected — the LN rail has no
 * server-side way to confirm settlement otherwise.
 *
 * The NWC method (ADR 0029) is the analogue: when the user sets or
 * changes their `nwc_uri`, we open the connection and probe
 * make_invoice/lookup_invoice via lib/nwc. The URI is a wallet
 * credential — encrypted at rest (lib/crypto) and never returned to
 * the client (the response carries a `nwc_connected` flag instead).
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Read raw bytes first so the hash matches what the client signed.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = UpdateUserProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const cbuChanged =
    parsed.data.cbu !== undefined && parsed.data.cbu !== auth.user.cbu;
  const aliasChanged =
    parsed.data.alias !== undefined && parsed.data.alias !== auth.user.alias;
  const lightningAddressChanged =
    parsed.data.lightning_address !== undefined &&
    parsed.data.lightning_address !== auth.user.lightning_address;
  const payoutMethodChanged =
    parsed.data.payout_method !== undefined &&
    parsed.data.payout_method !== auth.user.payout_method;
  // The stored nwc_uri is encrypted; compare against the decrypted
  // current value so an unchanged URI doesn't trigger a re-sign or a
  // re-probe (every encrypt() yields a fresh ciphertext).
  const currentNwcUri = auth.user.nwc_uri ? decrypt(auth.user.nwc_uri) : null;
  const nwcUriChanged =
    parsed.data.nwc_uri !== undefined && parsed.data.nwc_uri !== currentNwcUri;
  const requiresReSign =
    cbuChanged ||
    aliasChanged ||
    lightningAddressChanged ||
    payoutMethodChanged ||
    nwcUriChanged;

  // LUD-21 sanity check (ADR 0015). Probe the upstream provider
  // whenever the user sets or changes their LN address, regardless
  // of which rail is currently active. A seller may store the
  // address now and flip `payout_method` later in a separate PATCH;
  // if we only probed when the sats rail was already selected, that
  // later flip would activate an unverified address and break
  // settlement confirmation at checkout time.
  // Note: `nostr_lightning_address` (the public Nostr lud16, ADR 0030)
  // is deliberately NOT probed here and is absent from `requiresReSign`
  // above — it is public identity, not a payout destination, so any
  // LUD-16 address is accepted and editing it needs no NIP-98 re-sign.
  const nextLightningAddress =
    parsed.data.lightning_address ?? auth.user.lightning_address;
  if (lightningAddressChanged && nextLightningAddress) {
    try {
      await getLightningClient().mintInvoice(
        nextLightningAddress,
        1,
        "cursats-probe"
      );
    } catch (err) {
      if (err instanceof LightningMintError) {
        return NextResponse.json(
          { error: "lightning_address_invalid", reason: err.code },
          { status: 400 }
        );
      }
      throw err;
    }
  }

  // NWC connection check (ADR 0029), the NWC analogue of the LUD-21
  // probe above. Whenever the user sets or changes their NWC URI, we
  // open the connection and confirm it can mint + look up invoices
  // (get_info capabilities + a probe make_invoice/lookup_invoice).
  // Same rationale as the LN probe: a later flip to the NWC method
  // would otherwise activate an unverified connection.
  const nextNwcUri = parsed.data.nwc_uri ?? currentNwcUri;
  if (nwcUriChanged && nextNwcUri) {
    try {
      await validateNwcConnection(nextNwcUri);
    } catch (err) {
      if (err instanceof NwcError) {
        return NextResponse.json(
          { error: "nwc_invalid", reason: err.code },
          { status: 400 }
        );
      }
      throw err;
    }
  }

  let signedEventId: string | undefined;

  if (requiresReSign) {
    const header = parseNostrAuthHeader(req.headers.get("authorization"));
    if (!header.ok) {
      return NextResponse.json(
        { error: "auth_required", reason: header.reason },
        { status: 401 }
      );
    }

    const payloadHash = await hashSettingsBody(raw);
    const validation = validateNip98AuthEvent(header.event, {
      url: req.nextUrl.toString(),
      method: "PATCH",
      payloadHash,
    });
    if (!validation.ok) {
      if (validation.reason === "clock") {
        return NextResponse.json({ error: "auth_clock_skew" }, { status: 401 });
      }
      return NextResponse.json(
        { error: "auth_invalid_signature", reason: validation.reason },
        { status: 400 }
      );
    }

    if (validation.event.pubkey !== auth.session.pubkey) {
      return NextResponse.json({ error: "auth_mismatch" }, { status: 403 });
    }

    signedEventId = validation.event.id;
  }

  const updated = await updateUserProfile(
    auth.user.id,
    parsed.data,
    auth.session.pubkey,
    { signedEventId }
  );
  return NextResponse.json({
    user: {
      cbu: updated.cbu,
      alias: updated.alias,
      lightning_address: updated.lightning_address,
      nostr_lightning_address: updated.nostr_lightning_address,
      // Never return the NWC URI — it's an encrypted wallet
      // credential. The client only needs to know one is connected.
      nwc_connected: Boolean(updated.nwc_uri),
      payout_method: updated.payout_method,
      transfer_speed: updated.transfer_speed,
      locale: updated.locale,
      notification_prefs: updated.notification_prefs,
    },
  });
}

/**
 * Soft-delete the current user (ADR 0021). Scrubs PII fields,
 * stamps `deleted_at`, clears the session cookie so the request
 * returns the caller to an unauthenticated state. The row stays —
 * offerings, orders, and audit-log entries keep their foreign-key
 * references intact and the deleted account can't be re-claimed
 * (the pubkey check rejects on `deleted_at IS NOT NULL` via
 * `lib/creator/users.ts:ensureUserForPubkey`).
 *
 * Requires NIP-98 re-sign so a stolen session cookie can't take
 * the account out from under the rightful owner. Same envelope
 * shape as the PATCH path above — bound by URL + method + (empty)
 * body hash.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const header = parseNostrAuthHeader(req.headers.get("authorization"));
  if (!header.ok) {
    return NextResponse.json(
      { error: "auth_required", reason: header.reason },
      { status: 401 }
    );
  }

  // DELETE has no body, so the payload hash is the sha256 of the
  // empty string. The client signs the same.
  const emptyHash = await hashSettingsBody("");
  const validation = validateNip98AuthEvent(header.event, {
    url: req.nextUrl.toString(),
    method: "DELETE",
    payloadHash: emptyHash,
  });
  if (!validation.ok) {
    if (validation.reason === "clock") {
      return NextResponse.json({ error: "auth_clock_skew" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "auth_invalid_signature", reason: validation.reason },
      { status: 400 }
    );
  }
  if (validation.event.pubkey !== auth.session.pubkey) {
    return NextResponse.json({ error: "auth_mismatch" }, { status: 403 });
  }

  await softDeleteUser(auth.user.id, auth.session.pubkey, {
    signedEventId: validation.event.id,
  });

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  return NextResponse.json({ deleted: true });
}
