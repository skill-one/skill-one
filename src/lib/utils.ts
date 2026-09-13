export { cn } from "cn";

/** Format a count compactly, e.g. 169600 -> "169.6K", 12300 -> "12.3K". */
export function formatCount(count: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(count);
}

/**
 * Best-effort displayable message for a rejected action. Tauri commands reject
 * with a plain string rather than an `Error`, so reading `err.message` alone
 * loses the reason; `fallback` covers anything with no usable text.
 */
export function errorMessage(err: unknown, fallback = "未知错误"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
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
