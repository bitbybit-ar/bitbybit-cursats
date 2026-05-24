import { randomBytes } from "node:crypto";
import { eq, isNull, desc, isNotNull, and, count } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { offerings, orders } from "@/lib/db/schema";
import { writeAuditLog } from "./audit";

/**
 * Creator-side reads + mutations for the offerings catalog.
 * Public reads live in `lib/offerings.ts`; this module owns the
 * shapes the creator pages need (including archived rows) plus the
 * write paths, which always pair the DB change with an audit-log
 * row.
 *
 * Every helper takes a `userId` (ADRs 0012, 0016). Slug uniqueness
 * is per-user, so two users can both have an offering at
 * `/<their-slug>/c/intro-bitcoin` (ADR 0017).
 */

export type Offering = typeof offerings.$inferSelect;

/** Slug constraint — kebab-case, lowercase, ASCII. Matches ADR 0009. */
const SlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case ASCII");

/**
 * Tag constraint — kebab-case ASCII, ≤32 chars per tag. Same shape
 * as slugs because tags also flow into URLs (`/explore?q=<tag>`) and
 * we want stable, predictable identifiers across the marketplace.
 * ADR 0024.
 */
const TagSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "tag must be kebab-case ASCII");

/** Hard cap on tags per offering. Keeps the GIN index well-behaved
 *  and forces sellers to be selective — eight is plenty. ADR 0024.
 */
export const MAX_TAGS_PER_OFFERING = 8;

const TagsSchema = z
  .array(TagSchema)
  .max(MAX_TAGS_PER_OFFERING)
  .default([])
  .transform((tags) => Array.from(new Set(tags)));

/**
 * Normalise a raw list of tags from a UI or API client: trim, lowercase,
 * collapse internal whitespace into hyphens, drop empties, and dedupe.
 * Mirrors what the form already does client-side; defence-in-depth so
 * a hand-crafted request can't slip an unnormalised tag past Zod
 * validation.
 */
export function normalizeTags(raw: readonly string[] | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const t of raw) {
    const cleaned = t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (cleaned.length > 0 && cleaned.length <= 32) out.add(cleaned);
  }
  return Array.from(out).slice(0, MAX_TAGS_PER_OFFERING);
}

// Code-mint constants. The 28-char charset drops 0/O/1/I/L because
// they're ambiguous when a buyer reads the code off a receipt. With
// 8 random picks that's ~28^8 ≈ 3.8e11 codes — collisions inside a
// single offering's pool are functionally impossible.
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_BLOCK_LENGTH = 4;
const CODE_MAX_MINT = 10_000;

function mintCode(): string {
  const bytes = randomBytes(CODE_BLOCK_LENGTH * 2);
  let out = "";
  for (let i = 0; i < CODE_BLOCK_LENGTH * 2; i++) {
    out += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
    if (i === CODE_BLOCK_LENGTH - 1) out += "-";
  }
  return out;
}

/**
 * Generate `count` unique redemption codes. The `Set` dedupes
 * within the call; the caller is responsible for ensuring no
 * collision with the pool already on the offering (the consumer
 * `mintCodesForOffering` does that by merging then re-uniquing).
 */
export function mintCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(mintCode());
  }
  return Array.from(codes);
}

// `download_url` is followed by a 302 from `/api/downloads/[orderId]`
// after a buyer has paid, so it must be a real https endpoint —
// `javascript:`, `data:`, `file:`, and bare http are all phishing or
// downgrade vectors at that step. zod's `.url()` only checks shape, so
// the refinement here is load-bearing.
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "url must use https://");

const OfferingCommonFields = z.object({
  slug: SlugSchema,
  type: z.enum(["code", "download"]),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  price_amount: z.number().int().positive(),
  price_currency: z.enum(["ars", "sats"]),
  image_url: z.string().url(),
  download_url: HttpsUrlSchema.nullable().optional(),
  tags: TagsSchema,
});

export const CreateOfferingSchema = OfferingCommonFields.extend({
  // Quantity of redemption codes to mint server-side. Required when
  // type=code; ignored when type=download. The server generates the
  // pool; clients never send codes directly.
  code_count: z.number().int().positive().max(CODE_MAX_MINT).optional(),
}).superRefine((data, ctx) => {
  if (data.type === "download") {
    const url = data.download_url;
    if (!url || url.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["download_url"],
        message: "download_url is required when type is download",
      });
    }
  }
  if (data.type === "code") {
    if (!data.code_count || data.code_count <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["code_count"],
        message: "code_count is required when type is code",
      });
    }
  }
});

// Updates don't accept `code_count` — minting more codes is a
// dedicated endpoint (POST /api/my-courses/[id]/mint-codes) so the
// audit log can record the mint as a distinct action. Type changes
// on update would force handling a fresh code pool or a stranded
// download_url; we forbid them at the call site.
export const UpdateOfferingSchema = OfferingCommonFields.partial().superRefine(
  (data, ctx) => {
    if (data.type === "download") {
      const url = data.download_url;
      if (!url || url.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["download_url"],
          message: "download_url is required when type is download",
        });
      }
    }
  }
);

// `z.input` (not `z.infer`) on purpose: `tags` has a `.default([])`
// + transform, so `z.infer` makes it required in the output type.
// Callers (route handlers + tests) construct the *input* — tags
// optional, parsed value always present — so `z.input` matches the
// caller's POV. Same reasoning for `download_url` and `code_count`.
export type CreateOfferingInput = z.input<typeof CreateOfferingSchema>;
export type UpdateOfferingInput = z.input<typeof UpdateOfferingSchema>;

export async function listAllOfferings(userId: string): Promise<Offering[]> {
  const db = getDb();
  return db
    .select()
    .from(offerings)
    .where(and(eq(offerings.user_id, userId), isNull(offerings.archived_at)))
    .orderBy(desc(offerings.created_at));
}

export async function listArchivedOfferings(
  userId: string
): Promise<Offering[]> {
  const db = getDb();
  return db
    .select()
    .from(offerings)
    .where(and(eq(offerings.user_id, userId), isNotNull(offerings.archived_at)))
    .orderBy(desc(offerings.archived_at));
}

export async function getOfferingForCreator(
  userId: string,
  slug: string
): Promise<Offering | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(offerings)
    .where(and(eq(offerings.user_id, userId), eq(offerings.slug, slug)))
    .limit(1);
  return row ?? null;
}

/**
 * Verify an offering exists AND belongs to the named user.
 * Used by API routes that take a path id and must reject if the
 * caller's session is not the offering's owner.
 */
export async function getOfferingForCreatorById(
  userId: string,
  id: string
): Promise<Offering | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(offerings)
    .where(and(eq(offerings.user_id, userId), eq(offerings.id, id)))
    .limit(1);
  return row ?? null;
}

export type CreateOfferingResult =
  | { ok: true; offering: Offering }
  | { ok: false; reason: "slug_taken" };

export async function createOfferingForCreator(
  userId: string,
  input: CreateOfferingInput,
  actorPubkey: string
): Promise<CreateOfferingResult> {
  const db = getDb();

  // Slug-uniqueness guard before INSERT — per-user scope, ADR
  // 0012 (renamed in 0016). A different user can hold the same
  // slug. Race-windowed but cheap; the DB unique index on
  // (user_id, slug)
  // catches a simultaneous insert.
  const [existing] = await db
    .select({ id: offerings.id })
    .from(offerings)
    .where(and(eq(offerings.user_id, userId), eq(offerings.slug, input.slug)))
    .limit(1);
  if (existing) return { ok: false, reason: "slug_taken" };

  // Mint the initial code pool server-side when type=code. The
  // schema refine guarantees `code_count` is present for that case.
  const initialPool =
    input.type === "code" && input.code_count
      ? mintCodes(input.code_count)
      : [];

  const [row] = await db
    .insert(offerings)
    .values({
      user_id: userId,
      slug: input.slug,
      type: input.type,
      title: input.title,
      description: input.description,
      price_amount: input.price_amount,
      price_currency: input.price_currency,
      image_url: input.image_url,
      code_pool: initialPool,
      download_url: input.download_url ?? null,
      tags: normalizeTags(input.tags),
    })
    .returning();

  await writeAuditLog({
    user_id: userId,
    actor_pubkey: actorPubkey,
    route: "/api/my-courses",
    action: "create",
    payload_diff: {
      offering_id: row.id,
      slug: row.slug,
      type: row.type,
      title: row.title,
      price_amount: row.price_amount,
      price_currency: row.price_currency,
      code_count: initialPool.length,
    },
  });

  return { ok: true, offering: row };
}

export type UpdateOfferingResult =
  | { ok: true; offering: Offering }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "slug_taken" };

export async function updateOfferingForCreator(
  userId: string,
  id: string,
  patch: UpdateOfferingInput,
  actorPubkey: string
): Promise<UpdateOfferingResult> {
  const db = getDb();

  const existing = await getOfferingForCreatorById(userId, id);
  if (!existing) return { ok: false, reason: "not_found" };

  if (patch.slug && patch.slug !== existing.slug) {
    const [conflict] = await db
      .select({ id: offerings.id })
      .from(offerings)
      .where(and(eq(offerings.user_id, userId), eq(offerings.slug, patch.slug)))
      .limit(1);
    if (conflict && conflict.id !== id) {
      return { ok: false, reason: "slug_taken" };
    }
  }

  const [row] = await db
    .update(offerings)
    .set({
      slug: patch.slug ?? existing.slug,
      type: patch.type ?? existing.type,
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      price_amount: patch.price_amount ?? existing.price_amount,
      price_currency: patch.price_currency ?? existing.price_currency,
      image_url: patch.image_url ?? existing.image_url,
      download_url:
        patch.download_url === undefined
          ? existing.download_url
          : patch.download_url,
      tags:
        patch.tags === undefined ? existing.tags : normalizeTags(patch.tags),
      updated_at: new Date(),
    })
    .where(and(eq(offerings.user_id, userId), eq(offerings.id, id)))
    .returning();

  // Compute a small diff summary for the audit row. We DO NOT
  // record full description text or the entire code pool in the
  // audit log — those are large and the row is recoverable from
  // the offerings table anyway. We do record which fields
  // changed, so a future "what did they edit?" reviewer can scan.
  const changedKeys = (
    Object.keys(patch) as Array<keyof UpdateOfferingInput>
  ).filter(
    (k) =>
      patch[k] !== undefined &&
      JSON.stringify(patch[k]) !== JSON.stringify(existing[k as keyof Offering])
  );
  await writeAuditLog({
    user_id: userId,
    actor_pubkey: actorPubkey,
    route: "/api/my-courses/[id]",
    action: "update",
    payload_diff: {
      offering_id: id,
      changed: changedKeys,
    },
  });

  return { ok: true, offering: row };
}

export type ArchiveOfferingResult =
  | { ok: true; offering: Offering }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "already_archived" };

export async function archiveOfferingForCreator(
  userId: string,
  id: string,
  actorPubkey: string
): Promise<ArchiveOfferingResult> {
  const db = getDb();

  const existing = await getOfferingForCreatorById(userId, id);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.archived_at !== null) {
    return { ok: false, reason: "already_archived" };
  }

  const [row] = await db
    .update(offerings)
    .set({ archived_at: new Date(), updated_at: new Date() })
    .where(and(eq(offerings.user_id, userId), eq(offerings.id, id)))
    .returning();

  await writeAuditLog({
    user_id: userId,
    actor_pubkey: actorPubkey,
    route: "/api/my-courses/[id]",
    action: "archive",
    payload_diff: {
      offering_id: id,
      slug: existing.slug,
    },
  });

  return { ok: true, offering: row };
}

export type DeleteOfferingResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "has_sales" };

/**
 * Permanently delete an offering. Unlike {@link
 * archiveOfferingForCreator} (the reversible soft-delete), this drops
 * the row. `orders.offering_id` has no cascade and we never orphan
 * sale history (see the schema note on `offerings`), so the delete is
 * refused while *any* order references the offering — the seller
 * archives instead. ADR 0031 exposes this for unsold courses only.
 */
export async function deleteOfferingForCreator(
  userId: string,
  id: string,
  actorPubkey: string
): Promise<DeleteOfferingResult> {
  const db = getDb();

  const existing = await getOfferingForCreatorById(userId, id);
  if (!existing) return { ok: false, reason: "not_found" };

  const [{ value: orderCount }] = await db
    .select({ value: count() })
    .from(orders)
    .where(eq(orders.offering_id, id));
  if (orderCount > 0) return { ok: false, reason: "has_sales" };

  await db
    .delete(offerings)
    .where(and(eq(offerings.user_id, userId), eq(offerings.id, id)));

  await writeAuditLog({
    user_id: userId,
    actor_pubkey: actorPubkey,
    route: "/api/my-courses/[id]/delete",
    action: "delete",
    payload_diff: {
      offering_id: id,
      slug: existing.slug,
    },
  });

  return { ok: true };
}

export type MintCodesResult =
  | { ok: true; offering: Offering; minted: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "wrong_type" }
  | { ok: false; reason: "too_many" };

/**
 * Append `count` freshly-minted codes to a code-type offering's
 * pool. Refuses if the offering is type=download (no pool) or if
 * the requested count exceeds `CODE_MAX_MINT`. The mint is a
 * distinct audit action so a future "where did these codes come
 * from?" reviewer can trace it.
 */
export async function mintCodesForOffering(
  userId: string,
  id: string,
  count: number,
  actorPubkey: string
): Promise<MintCodesResult> {
  if (count <= 0 || count > CODE_MAX_MINT) {
    return { ok: false, reason: "too_many" };
  }

  const db = getDb();
  const existing = await getOfferingForCreatorById(userId, id);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.type !== "code") return { ok: false, reason: "wrong_type" };

  // Mint fresh codes and merge with the existing pool, de-duplicated
  // (the charset is large enough that a collision is astronomically
  // unlikely, but the Set is free insurance).
  const fresh = mintCodes(count);
  const merged = Array.from(new Set([...(existing.code_pool ?? []), ...fresh]));

  const [row] = await db
    .update(offerings)
    .set({ code_pool: merged, updated_at: new Date() })
    .where(and(eq(offerings.user_id, userId), eq(offerings.id, id)))
    .returning();

  await writeAuditLog({
    user_id: userId,
    actor_pubkey: actorPubkey,
    route: "/api/my-courses/[id]/mint-codes",
    action: "mint_codes",
    payload_diff: {
      offering_id: id,
      minted: count,
      pool_size_after: merged.length,
    },
  });

  return { ok: true, offering: row, minted: count };
}
