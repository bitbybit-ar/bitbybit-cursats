/** Merge CSS module class names — falsy values are filtered out. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Return true if `value` matches the canonical UUID shape (any version). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Generate a URL-safe slug from a title, with a short random suffix. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
