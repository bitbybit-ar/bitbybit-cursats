/**
 * Download-access limits for `download`-type offerings, enforced on
 * `/api/downloads/[orderId]`.
 *
 * Kept in its own tiny, dependency-free module so a client component
 * (the receipt page's download card) and the server route can share
 * the same values without pulling the DB layer into a client bundle —
 * mirrors `lib/wapu-limits.ts`.
 *
 * A paid download order grants the buyer a bounded right to fetch the
 * file: at most `MAX_DOWNLOADS_PER_ORDER` times, within
 * `DOWNLOAD_ACCESS_WINDOW_DAYS` of payment. The receipt link is the
 * access key (ADR 0006); these limits cap how much that one link
 * yields.
 */

/** How many times a single paid order may fetch its download. */
export const MAX_DOWNLOADS_PER_ORDER = 5;

/** Days after `paid_at` that the download link stays live. */
export const DOWNLOAD_ACCESS_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment a paid order's download link stops working. */
export function downloadAccessExpiresAt(paidAt: Date): Date {
  return new Date(paidAt.getTime() + DOWNLOAD_ACCESS_WINDOW_DAYS * DAY_MS);
}

/**
 * True once a paid order's download window has elapsed. An order with
 * no `paid_at` (not yet paid) is never "expired" here — the route's
 * paid-status check is the gate for that case.
 */
export function isDownloadAccessExpired(
  paidAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!paidAt) return false;
  return now.getTime() > downloadAccessExpiresAt(paidAt).getTime();
}

/** Downloads still available on an order, floored at zero. */
export function downloadsRemaining(downloadCount: number): number {
  return Math.max(0, MAX_DOWNLOADS_PER_ORDER - downloadCount);
}
