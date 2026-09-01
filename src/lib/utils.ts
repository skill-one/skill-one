import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic, resolving conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a count compactly, e.g. 169600 -> "169.6K", 12300 -> "12.3K". */
export function formatCount(count: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

/**
 * Shorten a registry content fingerprint for display, e.g.
 * "t1-a4cf6ce14f6d65b3" -> "#a4cf6ce1". The scheme segment (`t1`) describes how
 * the hash was computed, not which version it is, so it stays out of the UI;
 * the full value belongs in the tooltip.
 */
export function formatRev(rev: string): string {
  const scheme = rev.indexOf("-");
  const hash = scheme === -1 ? rev : rev.slice(scheme + 1);
  return `#${hash.slice(0, 8)}`;
}

/**
 * Date part of an ISO timestamp, in the user's locale and time zone. Returns
 * null when there is nothing to show (absent or unparseable), so callers can
 * skip the field instead of rendering a placeholder.
 */
export function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toLocaleDateString();
}
