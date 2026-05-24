// Querystring parsing for the seller /orders surface. Mirrors the
// shape of `lib/purchases-params.ts` so the page stays a server
// component and the filter URLs stay shareable.

export const ORDERS_PAGE_SIZE = 20;

// Hard cap mirroring purchases/explore params: guards against
// `?page=999999999` turning into a massive OFFSET scan.
const MAX_PAGE = 1000;

// Compound status buckets shown on the seller order list. The keys
// double as the `orderLabel` i18n keys and the buckets returned by
// `orderDisplayStatus` (lib/creator/orders) — one vocabulary across
// display, filter, and query. `refunded` is display-only (a rare
// manual state) and is intentionally not offered as a filter.
export type OrderStatusFilter =
  | "all"
  | "pendingPayment"
  | "withdrawalPending"
  | "settling"
  | "settled"
  | "settlementFailed"
  | "paid"
  | "failed";

// Order of the status dropdown, roughly following an order's lifecycle.
export const ORDER_STATUS_FILTERS: OrderStatusFilter[] = [
  "all",
  "pendingPayment",
  "withdrawalPending",
  "settling",
  "settled",
  "settlementFailed",
  "paid",
  "failed",
];

const STATUS_KEYS = new Set<OrderStatusFilter>(ORDER_STATUS_FILTERS);

// Offering-slug filter (the `?course=` link from My courses). Kebab-case,
// matching the slug constraint in lib/creator/offerings. An invalid value
// is ignored rather than 400'd — it's a display filter, not a mutation.
const COURSE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface OrdersParams {
  course: string;
  status: OrderStatusFilter;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;

function readFirst(raw: Raw, key: string): string | undefined {
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseOrdersParams(raw: Raw | undefined): OrdersParams {
  const r = raw ?? {};

  const courseRaw = (readFirst(r, "course") ?? "").slice(0, 80);
  const course = COURSE_RE.test(courseRaw) ? courseRaw : "";

  const statusRaw = readFirst(r, "status") ?? "all";
  const status = STATUS_KEYS.has(statusRaw as OrderStatusFilter)
    ? (statusRaw as OrderStatusFilter)
    : "all";

  const pageRaw = Number.parseInt(readFirst(r, "page") ?? "1", 10);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, MAX_PAGE) : 1;

  return { course, status, page };
}

// Builds a locale-free href like `/orders?course=piano&status=settling&page=2`.
// Default values are omitted so URLs stay tidy when only one knob is
// active. Locale prefixing happens at render time via the next-intl
// `Link` component.
export function buildOrdersHref(
  current: OrdersParams,
  patch: Partial<OrdersParams> = {}
): string {
  const merged: OrdersParams = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.course) params.set("course", merged.course);
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.page > 1) params.set("page", String(merged.page));
  const qs = params.toString();
  return qs ? `/orders?${qs}` : "/orders";
}

export function ordersHasActiveFilters(p: OrdersParams): boolean {
  return Boolean(p.course || p.status !== "all");
}
