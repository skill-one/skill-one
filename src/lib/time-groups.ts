/**
 * Relative-time filing for the installed list's skill unit.
 *
 * Every installed skill carries when its directory landed on disk
 * (`SkillView.installedAt`, Unix seconds). The skill unit files that fact into
 * fixed, non-overlapping buckets a reader scans newest-first — 今天, 昨天,
 * 近7天 (the current week window minus the two named days), 近30天, 更早 —
 * plus one trailing bucket, 时间未知, for installs the platform recorded no
 * birth time for (some Linux filesystems) or that another tool dropped on disk
 * without one.
 *
 * The boundaries are calendar-day based in the reader's own time zone, so the
 * labels say what a clock on the wall says rather than "the last 86 400 000
 * ms". `now` is injectable purely so the filing is testable without freezing
 * the clock; every caller omits it.
 */

/** The identity of one relative-time bucket, in filing order. */
export type TimeBucketKey =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "earlier"
  | "unknown";

/** One bucket's identity and the header it renders. */
export interface TimeBucket {
  key: TimeBucketKey;
  /** The group header's title, pinned to zh-CN like the rest of the chrome. */
  title: string;
}

/** One day in milliseconds — every boundary below is a whole day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The buckets in the order they are listed — most recent first, the installs
 * no timestamp vouches for last. Only buckets that actually hold an item
 * render, so this is the filing order rather than the rendered list itself.
 */
export const TIME_BUCKETS: readonly TimeBucket[] = [
  { key: "today", title: "今天" },
  { key: "yesterday", title: "昨天" },
  { key: "week", title: "近7天" },
  { key: "month", title: "近30天" },
  { key: "earlier", title: "更早" },
  { key: "unknown", title: "时间未知" },
];

/** Local midnight (the reader's time zone) of the day `now` belongs to. */
function startOfToday(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Which bucket one install timestamp (Unix seconds, UTC) belongs to. A stamp
 * ahead of the clock — clock skew, or a hand-made directory — reads as 今天:
 * it is the newest thing on disk either way, exactly as the drawer's relative
 * label deliberately does not clamp it either.
 */
export function timeBucketOf(
  seconds: number | null | undefined,
  now: Date = new Date(),
): TimeBucketKey {
  if (seconds == null || !Number.isFinite(seconds)) return "unknown";
  const t = seconds * 1000;
  const midnight = startOfToday(now);
  if (t >= midnight) return "today";
  if (t >= midnight - DAY_MS) return "yesterday";
  if (t >= midnight - 7 * DAY_MS) return "week";
  if (t >= midnight - 30 * DAY_MS) return "month";
  return "earlier";
}

/** One filed bucket: its identity and the items it holds. */
export interface TimeGroup<T> {
  key: TimeBucketKey;
  title: string;
  items: T[];
}

/**
 * File items into the relative-time buckets, most recent first. Items inside
 * every timestamped bucket are ordered newest-first too; equal timestamps keep
 * their incoming order (the sort is stable), and the 时间未知 bucket is never
 * reordered — those items carry no order the filesystem can prove.
 *
 * The input array itself is never mutated: the buckets are freshly built and
 * only those fresh arrays are sorted.
 */
export function groupByInstallTime<T>(
  items: readonly T[],
  timeOf: (item: T) => number | null | undefined,
  now: Date = new Date(),
): TimeGroup<T>[] {
  const byKey = new Map<TimeBucketKey, T[]>();
  for (const item of items) {
    const key = timeBucketOf(timeOf(item), now);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(item);
    else byKey.set(key, [item]);
  }
  const groups: TimeGroup<T>[] = [];
  for (const { key, title } of TIME_BUCKETS) {
    const bucket = byKey.get(key);
    if (!bucket) continue;
    if (key !== "unknown") {
      bucket.sort((a, b) => (timeOf(b) ?? 0) - (timeOf(a) ?? 0));
    }
    groups.push({ key, title, items: bucket });
  }
  return groups;
}
