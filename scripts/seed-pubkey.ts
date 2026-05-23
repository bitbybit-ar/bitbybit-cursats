import { decode } from "nostr-tools/nip19";
import { NostrPubkeySchema } from "@/lib/schemas/primitives";

/**
 * Fallback owner for the "Profe Demo" seed user when SEED_PUBKEY is
 * unset: the all-zeros pubkey. Nobody holds its private key, so the
 * seeded offerings populate the public catalog but cannot be signed
 * into — they exist only so a fresh install has something to browse
 * and buy against.
 */
export const ALL_ZEROS_PUBKEY =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Resolve the seed user's owner pubkey from the SEED_PUBKEY env var,
 * shared by `seed-offerings.ts` and `unseed-offerings.ts` so both
 * target the same row.
 *
 * Accepts an `npub1…` or a 64-character hex pubkey and normalizes to
 * lowercase hex — the on-disk shape that `ensureUserForPubkey`
 * (/api/auth/nostr) writes, so signing in with the matching key lands
 * on the same `users` row and the seeded offerings show up under
 * /my-courses. Falls back to ALL_ZEROS_PUBKEY when unset.
 *
 * Only a PUBLIC key is ever needed here; an nsec is rejected so a
 * private key never has to live in an env file.
 */
export function resolveSeedPubkey(): string {
  const raw = process.env.SEED_PUBKEY?.trim();
  if (!raw) return ALL_ZEROS_PUBKEY;

  if (raw.startsWith("nsec1")) {
    throw new Error(
      "SEED_PUBKEY looks like an nsec (a private key). Pass a PUBLIC key " +
        "instead — your npub1… or 64-character hex pubkey. The seed never " +
        "needs your secret; sign in separately to own the offerings."
    );
  }

  if (raw.startsWith("npub1")) {
    let decoded: ReturnType<typeof decode>;
    try {
      decoded = decode(raw);
    } catch {
      throw new Error(`SEED_PUBKEY is not a valid npub: ${raw}`);
    }
    if (decoded.type !== "npub") {
      throw new Error(
        `SEED_PUBKEY decoded to a "${decoded.type}" entity; expected an npub.`
      );
    }
    return decoded.data;
  }

  const parsed = NostrPubkeySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      "SEED_PUBKEY must be an npub1… or a 64-character hex pubkey."
    );
  }
  return parsed.data;
}
