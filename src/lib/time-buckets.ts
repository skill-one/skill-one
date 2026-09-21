/**
 * Age sections for the installed list's time grouping (`我的 skills` → 按时间).
 *
 * The sections are a timeline, so they are ordered and a skill lands in the
 * *first* one it fits: the windows nest (`今天` ⊂ `近 7 天` ⊂ `近 30 天`), and
 * testing narrowest-first is what keeps that unambiguous.
 *
 * Rolling windows rather than calendar ones (`本周` / `本月`): their bounds are
 * plain arithmetic from `now`, so there is no locale's week start to decide and
 * the whole ladder is testable by moving the clock. `今天` is the one
 * calendar-flavoured section, because "today" is the word a reader expects at
 * the top of a timeline where "24 小时内" would read like a metric.
 */

/** Seconds in a day — the ladder's only unit. */
const DAY = 24 * 60 * 60;

/**
 * Every section in reading order, newest first. The last two are catch-alls:
 * `更早` takes whatever is older than a year, and `未记录时间` the skills whose
 * directory reported no creation time (some Linux filesystems — the same case
 * the drawer omits an install date for).
 */
const BUCKETS = [
  { key: "time-today", title: "今天" },
  { key: "time-week", title: "近 7 天" },
  { key: "time-month", title: "近 30 天" },
  { key: "time-year", title: "近一年" },
  { key: "time-earlier", title: "更早" },
  { key: "time-unknown", title: "未记录时间" },
] as const;

/** One timeline section: its stable identity and the title its header shows. */
export type TimeBucket = (typeof BUCKETS)[number];

/** Every section, in the order the caller renders them. */
export const TIME_BUCKETS: readonly TimeBucket[] = BUCKETS;

/** The key of one of {@link TIME_BUCKETS}. */
export type TimeBucketKey = TimeBucket["key"];

/**
 * The section a skill's install time falls in.
 *
 * `now` is injectable so the ladder can be proved by moving the clock rather
 * than by freezing global time in every caller.
 */
export function timeBucketOf(
  installedAt: number | null | undefined,
  now: number = Date.now(),
): TimeBucketKey {
  if (installedAt == null || !Number.isFinite(installedAt)) {
    return "time-unknown";
  }
  const seconds = Math.floor(now / 1000);
  // Local midnight, so the first section matches the day the reader is in
  // rather than a trailing 24 hours of clock time.
  const todayStart = Math.floor(new Date(now).setHours(0, 0, 0, 0) / 1000);
  if (installedAt >= todayStart) return "time-today";
  if (installedAt > seconds - 7 * DAY) return "time-week";
  if (installedAt > seconds - 30 * DAY) return "time-month";
  if (installedAt > seconds - 365 * DAY) return "time-year";
  return "time-earlier";
}
