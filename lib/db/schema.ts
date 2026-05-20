import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Offering type — code redemption (in-person voucher) or downloadable
// asset (signed URL on the receipt page). Decision in ADR 0009.
export const offeringType = pgEnum("offering_type", ["code", "download"]);

// Currency the seller priced the offering in. The other currency is
// always computed at display time from the live Wapu exchange rate
// (see `lib/exchange-rate.ts`). Decision in ADR 0019 (pricing
// currency picker).
export const priceCurrency = pgEnum("price_currency", ["ars", "sats"]);

// Order status lifecycle.
//   pending  — invoice created, awaiting Lightning payment
//   paid     — Wapu webhook (wapu_ars rail) or LUD-21 verify
//              (direct_lightning rail) confirmed settlement
//   failed   — invoice expired or webhook reported failure
//   refunded — manual reversal (write actions are v1.1; column exists
//              now so the enum does not need migration when refunds land)
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);

// How a user gets paid (when they sell). Decision in ADR 0015.
//   cbu_alias         — Wapu converts sats→ARS and pushes to the
//                       user's Argentine bank alias or CBU.
//   lightning_address — Cursats mints a BOLT11 directly against the
//                       user's Lightning Address; sats land in
//                       the user's own wallet, no ARS conversion.
export const payoutMethod = pgEnum("payout_method", [
  "cbu_alias",
  "lightning_address",
]);

// Which settlement rail an individual order rode. Stamped at order
// creation from the seller's then-current `payout_method`. We
// snapshot it on the order so a user flipping their rail later
// does not retroactively change the receipt of an already-paid order.
export const orderRail = pgEnum("order_rail", ["wapu_ars", "direct_lightning"]);

// --- Users ---
// One row per signed-in account. Keyed by Nostr pubkey — the user's
// identity is their key, period. Auto-created at sign-in (ADR 0014)
// from kind:0 metadata; payout fields stay null until the user sells.
// Decision in ADR 0016 (collapses the prior `merchants` table into
// `users`; supersedes the table-naming half of ADR 0012).
//
// Payout fields (cbu, alias, lightning_address) are meaningful only
// for users who actually sell. The application layer rejects
// checkouts on an offering whose seller has neither rail filled in.
//
// `active` is the platform-admin moderation gate. Inactive users
// disappear from discovery and their offerings cannot be purchased,
// but the row + history stays for audit.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pubkey: varchar("pubkey", { length: 64 }).notNull().unique(),
    slug: varchar("slug", { length: 40 }).notNull().unique(),
    display_name: varchar("display_name", { length: 80 }).notNull(),
    bio: text("bio"),
    avatar_url: text("avatar_url"),
    // Wide banner image displayed behind the avatar + name + bio on
    // the public storefront. Seeded from kind:0 `banner` at sign-in;
    // editable from /settings. Null when the user has no banner set.
    banner_url: text("banner_url"),
    cbu: text("cbu"),
    alias: text("alias"),
    // Lightning Address used when payout_method = 'lightning_address'.
    // Format: local-part@domain. Validated at write time to also
    // resolve a working LNURL-pay endpoint with LUD-21 support.
    lightning_address: varchar("lightning_address", { length: 128 }),
    // Which rail this user uses to receive funds (when selling).
    // ADR 0015. 'cbu_alias' preserves prior behavior on migration;
    // users who want sats flip the radio in the settings page.
    payout_method: payoutMethod("payout_method").notNull().default("cbu_alias"),
    features_autorenewal: boolean("features_autorenewal")
      .notNull()
      .default(false),
    // Default UI language for this user. The navbar's locale switch
    // is a temporary session-only override (URL prefix); this is the
    // value applied on next sign-in. ADR 0021.
    locale: varchar("locale", { length: 2 }).notNull().default("es"),
    // Per-kind notification opt-outs. Missing key or `true` = enabled;
    // `false` skips the insert in `lib/notifications.ts:emitNotification`.
    // ADR 0021.
    notification_prefs: jsonb("notification_prefs")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    active: boolean("active").notNull().default(true),
    // Soft-delete timestamp for the "Delete account" flow in
    // /settings. When set, PII fields above are scrubbed and the
    // user can no longer sign in. Distinct from `active` (admin
    // moderation gate) so a deactivated-by-platform user can be
    // reactivated, while a user-initiated delete is permanent.
    // ADR 0021.
    deleted_at: timestamp("deleted_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_pubkey_idx").on(table.pubkey),
    uniqueIndex("users_slug_idx").on(table.slug),
    index("users_active_idx").on(table.active),
  ]
);

// --- Offerings ---
// Catalog rows. Edited from /[locale]/my-courses. Decisions in
// ADRs 0009 (storage), 0012 (per-seller ownership, predates the
// users-table rename), 0014 (any signed-in user can sell), and
// 0016 (merchants table collapsed into users). Soft delete via
// archived_at; hard delete is not exposed in v1 because orders
// reference offerings and we do not want orphaned references.
export const offerings = pgTable(
  "offerings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Slug is unique per user, not globally — two users can both
    // have an offering called "intro-bitcoin".
    slug: varchar("slug", { length: 80 }).notNull(),
    type: offeringType("type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    // Seller-chosen price in their chosen currency. The display
    // layer (PriceTag, OfferingCard) computes the other currency
    // live via `lib/exchange-rate.ts`. ADR 0019.
    price_amount: integer("price_amount").notNull(),
    price_currency: priceCurrency("price_currency").notNull(),
    image_url: text("image_url"),
    // Discovery + recommendation signal. Kebab-case, lowercase ASCII;
    // ≤8 tags per offering, ≤32 chars per tag (enforced by the Zod
    // schema in `lib/admin/offerings.ts`). Empty array default so
    // pre-tags rows behave like rows with no tags rather than NULL,
    // which would force every read site to handle a third state.
    // GIN index on the column powers `tags && $signal` queries used
    // by `lib/recommendations.ts` and the `q = ANY(tags)` clause in
    // `listDiscoveryOfferingsPaged`. ADR 0024.
    tags: text("tags")
      .array()
      .$type<string[]>()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // For type=code: pool of redemption codes. For type=download: null.
    code_pool: text("code_pool")
      .array()
      .$type<string[]>()
      .default(sql`ARRAY[]::text[]`),
    // For type=download: source URL signed at delivery time. For
    // type=code: null.
    download_url: text("download_url"),
    archived_at: timestamp("archived_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("offerings_user_slug_idx").on(table.user_id, table.slug),
    index("offerings_user_id_idx").on(table.user_id),
    index("offerings_archived_at_idx").on(table.archived_at),
    // GIN index for tag containment / overlap queries. Drizzle's
    // index().using() supports the second arg as a list of column
    // refs; raw `sql` is unnecessary here.
    index("offerings_tags_gin_idx").using("gin", table.tags),
  ]
);

// --- Orders ---
// One row per checkout. id is the opaque orderId in the receipt URL
// /[locale]/receipt/[orderId]. Anonymous orders have null pubkey;
// logged-in or npub-paste-at-checkout orders carry the buyer pubkey
// for DM delivery and history. Decisions in ADRs 0007, 0009, 0012,
// 0016.
//
// user_id is denormalized from offering.user_id (the seller) — it
// could be derived through a join, but every per-seller query
// filters on it, so the index pays for itself.
//
// The Wapu integration moved from invoice-based (single-tenant) to
// direct-payment (marketplace, ADR 0012). `wapu_tentative_uuid`
// holds the direct-payment tentative the buyer is funding; the row
// also still carries `payment_hash` and `bolt11` because those are
// the artifacts the buyer's wallet sees and the UI renders.
//
// `rail` (ADR 0015) snapshots which settlement rail the order
// rides. `lnurl_verify_url` is set only on direct_lightning orders.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable on purpose — anonymous orders are the floor (ADR 0007).
    pubkey: varchar("pubkey", { length: 64 }),
    offering_id: uuid("offering_id")
      .notNull()
      .references(() => offerings.id),
    // The seller's user row.
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: orderStatus("status").notNull().default("pending"),
    amount_ars: integer("amount_ars").notNull(),
    amount_sats: integer("amount_sats").notNull(),
    // Which rail this order rides. Stamped at creation from the
    // seller's `payout_method`. ADR 0015.
    rail: orderRail("rail").notNull().default("wapu_ars"),
    payment_hash: varchar("payment_hash", { length: 64 }),
    wapu_tentative_uuid: text("wapu_tentative_uuid"),
    // BOLT11 invoice string. For wapu_ars: returned by Wapu's funding
    // endpoint. For direct_lightning: minted by lib/lightning from
    // the seller's LNURL-pay callback. Cached so the checkout page
    // survives reloads (and the QR can re-render) without re-calling
    // the upstream.
    bolt11: text("bolt11"),
    wapu_settlement_ref: text("wapu_settlement_ref"),
    // LUD-21 verify URL. Only set on direct_lightning orders. The
    // status poller GETs it to check settlement; null on wapu_ars
    // orders (Wapu fires a webhook there).
    lnurl_verify_url: text("lnurl_verify_url"),
    redemption_code: text("redemption_code"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    paid_at: timestamp("paid_at"),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("orders_pubkey_idx").on(table.pubkey),
    index("orders_status_idx").on(table.status),
    index("orders_offering_id_idx").on(table.offering_id),
    index("orders_user_id_idx").on(table.user_id),
    index("orders_created_at_idx").on(table.created_at),
  ]
);

// --- Admin audit log ---
// Append-only record of every panel mutation. Decision in ADR 0008.
// payload_diff is jsonb so the shape can evolve per route without
// schema changes; secrets must be redacted at the API layer before
// the write.
//
// user_id was added with ADR 0012 (renamed from merchant_id in
// ADR 0016): every audit row scopes to a user for filtering on the
// platform-admin moderation surface. Nullable for forward-compat
// with platform-level mutations that do not belong to any one user.
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").references(() => users.id),
    actor_pubkey: varchar("actor_pubkey", { length: 64 }).notNull(),
    route: text("route").notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    payload_diff: jsonb("payload_diff").$type<Record<string, unknown>>(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("admin_audit_log_actor_pubkey_idx").on(table.actor_pubkey),
    index("admin_audit_log_user_id_idx").on(table.user_id),
    index("admin_audit_log_created_at_idx").on(table.created_at),
  ]
);

// --- Notifications ---
// One row per in-app notification. Recipient is the Nostr pubkey
// (no FK to users — kept loose so a notification can land before
// the user row materializes if needed). Polled by the bell
// component every 30s. read_at null = unread; setting it stamps
// the time without deleting history. Decision in ADR 0014.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipient_pubkey: varchar("recipient_pubkey", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 40 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    read_at: timestamp("read_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("notifications_recipient_idx").on(
      table.recipient_pubkey,
      table.created_at
    ),
  ]
);
