/**
 * Collapse the pagination bar once there are too many pages to list: keep the
 * first and last pages plus a window of pages around the current one, inserting
 * "…" for each gap, so a wide range stays reachable without rendering hundreds
 * of buttons. When there are few pages (≤ SHOW_ALL_THRESHOLD) every page number
 * is shown directly.
 *
 * Used by the shared ListPager component.
 */

/** Pages at or below this count render every page number directly. */
const SHOW_ALL_THRESHOLD = 9;
/** Pages rendered on each side of the current one in the collapsed window. */
const PAGE_WINDOW = 2;

export function pageRange(current: number, total: number): Array<number | "..."> {
  if (total <= SHOW_ALL_THRESHOLD) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total]);
  for (let i = current - PAGE_WINDOW; i <= current + PAGE_WINDOW; i++) {
    pages.add(i);
  }
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: Array<number | "..."> = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("...");
    out.push(p);
    prev = p;
  }
  return out;
}
