// Querystring parsing for the /purchases surface. Mirrors the
// shape of `lib/explore-params.ts` so the page stays a server
// component and the filter URLs stay shareable.

export const PURCHASES_PAGE_SIZE = 12;

// Hard cap mirroring explore-params: 1000 pages × 12 = 12k orders,
// more than enough headroom and guards against `?page=999999999`
// turning into a massive `OFFSET` scan.
const MAX_PAGE = 1000;

export type PurchasesStatusFilter =
  | "all"
  | "pending"
  | "paid"
  | "failed";

export interface PurchasesParams {
  q: string;
  status: PurchasesStatusFilter;
  page: number;
}

const STATUS_KEYS = new Set<PurchasesStatusFilter>([
  "all",
  "pending",
  "paid",
  "failed",
]);

type Raw = Record<string, string | string[] | undefined>;

function readFirst(raw: Raw, key: string): string | undefined {
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parsePurchasesParams(raw: Raw | undefined): PurchasesParams {
  const r = raw ?? {};

  const qRaw = readFirst(r, "q") ?? "";
  const q = qRaw.trim().slice(0, 100);

  const statusRaw = readFirst(r, "status") ?? "all";
  const status = STATUS_KEYS.has(statusRaw as PurchasesStatusFilter)
    ? (statusRaw as PurchasesStatusFilter)
    : "all";

  const pageRaw = Number.parseInt(readFirst(r, "page") ?? "1", 10);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1
      ? Math.min(pageRaw, MAX_PAGE)
      : 1;

  return { q, status, page };
}

// Builds a locale-free href like `/purchases?status=paid&page=2`.
// Default values are omitted so URLs stay tidy when only one knob
// is active. Locale prefixing happens at render time via the
// next-intl `Link` component.
export function buildPurchasesHref(
  current: PurchasesParams,
  patch: Partial<PurchasesParams> = {}
): string {
  const merged: PurchasesParams = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.page > 1) params.set("page", String(merged.page));
  const qs = params.toString();
  return qs ? `/purchases?${qs}` : "/purchases";
}

export function purchasesHasActiveFilters(p: PurchasesParams): boolean {
  return Boolean(p.q || p.status !== "all");
}
