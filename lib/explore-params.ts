// Querystring parsing for the /explore discovery surface.
// The page is URL-driven (server component, no client state) — every
// control encodes its value into searchParams, and the page reads them
// back here. Whitelist every enum so a hand-crafted URL cannot inject
// arbitrary SQL via the sort/type/rail knobs.

export const PAGE_SIZE = 12;

// Hard cap on the page number we accept. Without this, a request like
// `?page=999999999` becomes `LIMIT 12 OFFSET ~12B` — Postgres still
// has to walk the offset. 1000 pages × 12 = 12k results, more than
// enough headroom for the marketplace's foreseeable future.
const MAX_PAGE = 1000;

export type OfferingTypeFilter = "code" | "download";
export type SortKey = "newest" | "oldest" | "price_asc" | "price_desc";

export interface ExploreParams {
  q: string;
  type: OfferingTypeFilter | null;
  sort: SortKey;
  page: number;
}

const TYPE_KEYS = new Set<OfferingTypeFilter>(["code", "download"]);
const SORT_KEYS = new Set<SortKey>([
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
]);

type Raw = Record<string, string | string[] | undefined>;

function readFirst(raw: Raw, key: string): string | undefined {
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseExploreParams(raw: Raw | undefined): ExploreParams {
  const r = raw ?? {};
  const qRaw = readFirst(r, "q") ?? "";
  const q = qRaw.trim().slice(0, 100);

  const typeRaw = readFirst(r, "type");
  const type =
    typeRaw && TYPE_KEYS.has(typeRaw as OfferingTypeFilter)
      ? (typeRaw as OfferingTypeFilter)
      : null;

  const sortRaw = readFirst(r, "sort") ?? "newest";
  const sort = SORT_KEYS.has(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "newest";

  const pageRaw = Number.parseInt(readFirst(r, "page") ?? "1", 10);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, MAX_PAGE) : 1;

  return { q, type, sort, page };
}

// Builds a locale-free href like `/explore?q=foo&page=2`. The page
// param is omitted when it's 1 and sort is omitted when it's the
// default — keeps URLs tidy when only one knob is active. Locale
// prefixing happens at render time via `Link` from `i18n/routing`.
export function buildExploreHref(
  current: ExploreParams,
  patch: Partial<ExploreParams> = {}
): string {
  const merged: ExploreParams = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.type) params.set("type", merged.type);
  if (merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));
  const qs = params.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export function hasActiveFilters(p: ExploreParams): boolean {
  return Boolean(p.q || p.type || p.sort !== "newest");
}
