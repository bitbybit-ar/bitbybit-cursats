import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  AliasSchema,
  CbuSchema,
  UserSlugSchema,
  RESERVED_SLUGS,
  classifyPayoutDestination,
} from "@/lib/admin/ar-bank-id";
import { LightningAddressSchema } from "@/lib/schemas/primitives";
import { writeAuditLog } from "./audit";

/**
 * User row helpers (ADRs 0012, 0014, 0016). One row per signed-in
 * Nostr account, keyed by their pubkey. Auto-created at sign-in
 * from kind:0 metadata; payout fields stay null until the user
 * actually sells something.
 *
 * Conventions:
 *
 *   - Reads accept either a pubkey or a slug; writes always go
 *     through the row id so the caller has already proven they
 *     are talking about a specific row.
 *   - The CBU/alias re-sign machinery from ADR 0008 lives at
 *     `lib/admin/sign-settings-payload.ts` and stays in place;
 *     the route consumers wire it through with the user id
 *     instead of the singleton settings row.
 *   - Audit-log writes carry `user_id` from this layer up so
 *     the platform-admin moderation surface can filter the log
 *     by user.
 */

export type User = typeof users.$inferSelect;

export const ClaimUserSchema = z.object({
  slug: UserSlugSchema,
  display_name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).nullable().optional(),
  // Payout fields are optional at claim time — the user fills them
  // in from the settings page before their first sale. The
  // application layer rejects checkouts on offerings whose seller
  // has neither.
  alias: AliasSchema.nullable().optional(),
  cbu: CbuSchema.nullable().optional(),
});

export type ClaimUserInput = z.infer<typeof ClaimUserSchema>;

/**
 * Per-kind notification opt-outs (ADR 0021). Keys are notification
 * kinds (e.g. "order.paid", "sale.received" — see
 * `lib/schemas/notifications.ts`). Missing key or `true` = enabled;
 * `false` skips the insert.
 */
export const NotificationPrefsSchema = z.record(z.string(), z.boolean());

export const UpdateUserProfileSchema = z
  .object({
    display_name: z.string().trim().min(2).max(80),
    bio: z.string().trim().max(500).nullable(),
    avatar_url: z.string().trim().url().nullable(),
    banner_url: z.string().trim().url().nullable(),
    alias: AliasSchema.nullable(),
    cbu: CbuSchema.nullable(),
    lightning_address: LightningAddressSchema.nullable(),
    payout_method: z.enum(["cbu_alias", "lightning_address"]),
    features_autorenewal: z.boolean(),
    locale: z.enum(["es", "en"]),
    notification_prefs: NotificationPrefsSchema,
  })
  .partial();

export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;

export async function getUserByPubkey(pubkey: string): Promise<User | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.pubkey, pubkey))
    .limit(1);
  return row ?? null;
}

export async function getUserBySlug(slug: string): Promise<User | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function listActiveUsers(): Promise<User[]> {
  const db = getDb();
  return db.select().from(users).where(eq(users.active, true));
}

/**
 * Slugify a free-form display name into something matching
 * USER_SLUG_REGEX. Lowercase, ASCII-only, hyphens between word
 * boundaries, max 40 chars, no leading/trailing hyphens. Returns
 * null when the input does not produce at least 3 valid characters
 * or matches a reserved route slug — caller falls back to the
 * pubkey-derived placeholder.
 */
export function slugifyDisplayName(name: string): string | null {
  const slug = name
    .normalize("NFKD")
    // Strip combining diacritical marks (U+0300–U+036F) so accented
    // chars decompose to their base letter (`é` → `e`, `ñ` → `n`).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (slug.length < 3) return null;
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

export interface InitialUserProfile {
  display_name?: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
}

/**
 * Return the user row keyed to `pubkey`, creating it lazily if it
 * does not exist (ADR 0014). Per ADR 0015, the row is seeded from
 * the user's Nostr kind:0 metadata at sign-in time when available;
 * subsequent calls without `initial` are pure reads + a placeholder
 * fallback for legacy or relay-failed cases.
 *
 * Cursats's marketplace model is "any signed-in Nostr user can sell".
 * The user row is data, not a gate — any surface that needs it
 * (the user's courses, settings, orders) can call this and trust
 * that a row will be there.
 */
export async function ensureUserForPubkey(
  pubkey: string,
  initial?: InitialUserProfile
): Promise<User> {
  const existing = await getUserByPubkey(pubkey);
  if (existing) return existing;

  const db = getDb();
  const placeholderSlug = `user-${pubkey.slice(0, 8).toLowerCase()}`;
  const namedSlug =
    initial?.display_name && slugifyDisplayName(initial.display_name);
  // Try the named slug first; fall back to the pubkey-derived
  // placeholder if it's missing/reserved/already taken.
  const candidates = [namedSlug, placeholderSlug].filter(
    (s): s is string => typeof s === "string"
  );
  const displayName = initial?.display_name?.trim() || placeholderSlug;

  // Retry on slug collision. The pubkey-prefixed candidate is
  // astronomically unlikely to collide; the named slug can if two
  // users share a display name. Final fallback uses a short random
  // suffix.
  const attempts = [
    ...candidates,
    `${placeholderSlug}-${Math.random().toString(36).slice(2, 6)}`,
    `${placeholderSlug}-${Math.random().toString(36).slice(2, 6)}`,
    `${placeholderSlug}-${Math.random().toString(36).slice(2, 6)}`,
  ];

  for (const slug of attempts) {
    try {
      const [row] = await db
        .insert(users)
        .values({
          pubkey,
          slug,
          display_name: displayName,
          avatar_url: initial?.avatar_url ?? null,
          banner_url: initial?.banner_url ?? null,
          bio: initial?.bio ?? null,
        })
        .returning();
      return row;
    } catch (err) {
      // A concurrent request claimed the pubkey first; re-read.
      const winner = await getUserByPubkey(pubkey);
      if (winner) return winner;
      // Slug collision — try the next candidate. Anything else,
      // bubble up.
      const message = err instanceof Error ? err.message : String(err);
      if (!/slug/i.test(message)) throw err;
    }
  }
  throw new Error("ensure_user_failed: slug retries exhausted");
}

/**
 * Insert a new user row keyed by `pubkey`. Throws on slug collision
 * so the API route can map the error code to a user-facing toast.
 */
export async function claimUser(
  pubkey: string,
  input: ClaimUserInput
): Promise<User> {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({
      pubkey,
      slug: input.slug,
      display_name: input.display_name,
      bio: input.bio ?? null,
      alias: input.alias ?? null,
      cbu: input.cbu ?? null,
    })
    .returning();
  await writeAuditLog({
    user_id: row.id,
    actor_pubkey: pubkey,
    route: "/api/sign-in",
    action: "claim",
    payload_diff: { slug: row.slug, display_name: row.display_name },
  });
  return row;
}

/**
 * Soft-delete a user (ADR 0021). Scrubs PII fields, stamps
 * `deleted_at`, marks `active = false`. The row stays so
 * foreign-key references (offerings, orders, audit log) remain
 * valid; the buyer flows already filter by `users.active` and
 * `offerings.archived_at`, so a deleted user's offerings will
 * disappear from discovery without needing to delete the rows.
 *
 * After this returns, the caller must also clear the session
 * cookie — that's the API route's job, not this helper's. Future
 * sign-in attempts with the same pubkey are blocked by the
 * `deleted_at IS NOT NULL` check we add to `ensureUserForPubkey`
 * — TODO: actually add that check; for now, a soft-deleted user
 * cannot sign in because their `active` is false.
 */
export async function softDeleteUser(
  id: string,
  actorPubkey: string,
  meta: { signedEventId?: string } = {}
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const shortId = id.slice(0, 8);
  await db
    .update(users)
    .set({
      display_name: `[deleted ${shortId}]`,
      bio: null,
      avatar_url: null,
      banner_url: null,
      cbu: null,
      alias: null,
      lightning_address: null,
      notification_prefs: {},
      active: false,
      deleted_at: now,
      updated_at: now,
    })
    .where(eq(users.id, id));

  const payload_diff: Record<string, unknown> = { action: "soft_delete" };
  if (meta.signedEventId) {
    payload_diff.signed = { event_id: meta.signedEventId, kind: 27235 };
  }
  await writeAuditLog({
    user_id: id,
    actor_pubkey: actorPubkey,
    route: "/api/settings",
    action: "delete",
    payload_diff,
  });
}

export async function updateUserProfile(
  id: string,
  patch: UpdateUserProfileInput,
  actorPubkey: string,
  meta: { signedEventId?: string } = {}
): Promise<User> {
  const db = getDb();
  const before = await getUserById(id);
  if (!before) {
    throw new Error(`user_not_found: ${id}`);
  }

  const next: Partial<User> = { updated_at: new Date() };
  if (patch.display_name !== undefined) next.display_name = patch.display_name;
  if (patch.bio !== undefined) next.bio = patch.bio;
  if (patch.avatar_url !== undefined) next.avatar_url = patch.avatar_url;
  if (patch.banner_url !== undefined) next.banner_url = patch.banner_url;
  if (patch.alias !== undefined) next.alias = patch.alias;
  if (patch.cbu !== undefined) next.cbu = patch.cbu;
  if (patch.lightning_address !== undefined) {
    next.lightning_address = patch.lightning_address;
  }
  if (patch.payout_method !== undefined) {
    next.payout_method = patch.payout_method;
  }
  if (patch.features_autorenewal !== undefined) {
    next.features_autorenewal = patch.features_autorenewal;
  }
  if (patch.locale !== undefined) next.locale = patch.locale;
  // Merge notification_prefs on top of the existing row instead of
  // overwriting — clients send partial patches (just the kind they
  // toggled). A full replace would lose any other opt-outs the
  // user set in a previous save.
  if (patch.notification_prefs !== undefined) {
    next.notification_prefs = {
      ...(before.notification_prefs ?? {}),
      ...patch.notification_prefs,
    };
  }

  const [row] = await db
    .update(users)
    .set(next)
    .where(eq(users.id, id))
    .returning();

  // Diff intentionally redacts CBU + alias values — payment-
  // destination secrets-adjacent. Record only WHICH fields
  // changed; the new values live in the row itself.
  const changedKeys = (
    Object.keys(patch) as Array<keyof UpdateUserProfileInput>
  ).filter(
    (k) =>
      patch[k] !== undefined &&
      JSON.stringify(patch[k]) !== JSON.stringify(before[k as keyof User])
  );
  const payload_diff: Record<string, unknown> = { changed: changedKeys };
  if (meta.signedEventId) {
    payload_diff.signed = { event_id: meta.signedEventId, kind: 27235 };
  }
  await writeAuditLog({
    user_id: row.id,
    actor_pubkey: actorPubkey,
    route: "/api/settings",
    action: "update",
    payload_diff,
  });

  return row;
}

/**
 * The Wapu direct-payment `alias` parameter accepts either an
 * Argentine bank alias (6–20 chars `[A-Za-z0-9.-]`) or a 22-digit
 * CBU. Pick whichever the user has on file, preferring alias
 * (shorter, the user typed it on purpose). Returns null when
 * the user has neither — the checkout layer rejects the order.
 */
export function pickPayoutAlias(user: User): string | null {
  if (user.alias) {
    const c = classifyPayoutDestination(user.alias);
    if (c) return c.value;
  }
  if (user.cbu) {
    const c = classifyPayoutDestination(user.cbu);
    if (c) return c.value;
  }
  return null;
}
