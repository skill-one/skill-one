import type { AppLocale } from "./i18n-content";

export { cn } from "cn";

/** BCP 47 tag for an app locale. */
function bcp47(locale: AppLocale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

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
export function errorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

/**
 * Date part of an ISO timestamp, in the given locale and time zone. Returns
 * null when there is nothing to show (absent or unparseable), so callers can
 * skip the field instead of rendering a placeholder.
 */
export function formatDate(
  iso: string | undefined,
  locale: AppLocale,
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms)
    ? null
    : new Date(ms).toLocaleDateString(bcp47(locale));
}

/**
 * Date part of a Unix timestamp in **seconds**, as the backend reports a skill
 * directory's creation time (`installedAt`), in the given locale and time
 * zone. Returns null when there is nothing displayable (absent, or a value the
 * platform could not record), so callers can skip the field entirely.
 */
export function formatUnixDate(
  seconds: number | null | undefined,
  locale: AppLocale,
): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toLocaleDateString(bcp47(locale));
}

/**
 * Largest unit first: the first one at least a whole unit has elapsed in wins.
 * A table instead of a ladder of `if`s, so adding `week` or `quarter` is one
 * row. Seconds are the fallback below this table, not a row in it.
 */
const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * How long ago a Unix timestamp in seconds was, e.g. `3天前` / `1个月前` /
 * `2年前` — the readable form of the backend's `installedAt`.
 *
 * `Intl.RelativeTimeFormat` is the platform's own formatter (no dependency to
 * add for one label), resolved in the locale the UI renders in. `numeric:
 * "always"` keeps every bucket uniform and exact — `"auto"` only rewrites the
 * ±1 buckets and would turn a fact ("1年前") into a vague idiom ("去年").
 *
 * Whole units only, so 47 hours reads `1天前` rather than `2` — the count of
 * units that have *passed*, not a rounding-up. Anything under a minute reads
 * `刚刚` / "just now" instead of a nonsensical `0分钟前`. A stamp ahead of the
 * clock (only clock skew or a hand-made directory can produce one) reads
 * `2小时后`, and is deliberately not clamped: it is honest about what the
 * filesystem reported.
 *
 * `now` is injectable purely so the bucketing can be tested without freezing
 * the clock; every caller omits it.
 */
export function formatRelativeTime(
  seconds: number | null | undefined,
  locale: AppLocale,
  now: number = Date.now(),
): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const delta = seconds - now / 1000;
  const magnitude = Math.abs(delta);
  const unit = RELATIVE_UNITS.find(([, size]) => magnitude >= size);
  if (!unit) return locale === "zh" ? "刚刚" : "just now";
  // A formatter per call mirrors `formatCount`; there is one call per drawer.
  return new Intl.RelativeTimeFormat(bcp47(locale), {
    numeric: "always",
  }).format(Math.trunc(delta / unit[1]), unit[0]);
}
