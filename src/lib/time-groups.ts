/**
 * Per-day filing for the installed list.
 *
 * Every installed skill carries when its directory landed on disk
 * (`SkillView.installedAt`, Unix seconds). The filing gives each calendar day
 * that holds an install its own group, listed newest-first — 今天 and 昨天
 * keep their relative names, every other day reads as a date (9月22日; a day
 * of another year carries the year, 2025年12月3日) — plus one trailing group,
 * 时间未知, for installs the platform recorded no birth time for (some Linux
 * filesystems) or that another tool dropped on disk without one. The skill
 * unit files the skills themselves; the repository unit files each repository
 * by the newest install it contains, and lists the skills inside it in the
 * same newest-first order.
 *
 * The days are calendar days in the reader's own time zone, so the labels say
 * what a clock on the wall says rather than "the last 86 400 000 ms". A stamp
 * ahead of the clock — clock skew, or a hand-made directory — reads as 今天:
 * it is the newest thing on disk either way, exactly as the drawer's relative
 * label deliberately does not clamp it either. Localizing is the render
 * layer's job (the lib has no locale): a named day carries its i18n key, a
 * dated day carries its local midnight for the caller to format (see
 * `formatDayHeading`). `now` is injectable purely so the filing is testable
 * without freezing the clock; every caller omits it.
 */

/** One day in milliseconds — the filing's grain. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One day's identity. The key is stable per local calendar day — `today`,
 * `yesterday`, or the day itself as `yyyy-MM-dd` — so a renderer can key
 * sections by it and never collide a named day with a dated one. A named day
 * carries its i18n key (`titleKey`) and no timestamp; a dated day carries
 * null there and its local midnight (`start`, ms) for the render layer to
 * format in the locale the UI renders in.
 */
export interface DayFiling {
  key: string;
  /** i18n key of the header ("time.today" / "time.yesterday"), or null. */
  titleKey: string | null;
  /** The day's local midnight (ms); set for a dated day, null otherwise. */
  start: number | null;
}

/** Local midnight (the reader's time zone) of the day `date` belongs to. */
function localMidnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Which day one install timestamp (Unix seconds, UTC) files under. A stamp
 * with no usable value files nowhere — the caller pools those last under
 * 时间未知 — and one ahead of the clock clamps to today.
 */
export function dayFilingOf(
  seconds: number | null | undefined,
  now: Date = new Date(),
): DayFiling | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const today = localMidnight(now);
  const start = localMidnight(new Date(Math.min(seconds * 1000, today)));
  // Whole days back; rounding absorbs the 23/25-hour DST day.
  const daysBack = Math.round((today - start) / DAY_MS);
  if (daysBack <= 0) {
    return { key: "today", titleKey: "time.today", start: null };
  }
  if (daysBack === 1) {
    return { key: "yesterday", titleKey: "time.yesterday", start: null };
  }
  const day = new Date(start);
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  return { key, titleKey: null, start };
}

/** One filed group: its identity and the items it holds. */
export interface TimeGroup<T> {
  /** The day's stable identity (see `DayFiling`); `unknown` trails. */
  key: string;
  /** i18n key of the header, or null for a dated day (format `start`). */
  titleKey: string | null;
  /** The day's local midnight (ms); null for the named/unknown groups. */
  start: number | null;
  items: T[];
}

/**
 * Newest-first comparator over anything carrying an install timestamp.
 *
 * Time is the whole of the ordering: a newer timestamp always wins, and an
 * item with no timestamp cannot claim any position the filesystem proves, so
 * it settles last. Equal stamps — which include every pair in 时间未知 —
 * defer to `tieBreak` (a name, a key) so ties stay deterministic without the
 * tie-break ever outranking time.
 */
export function compareByInstalledTime<T>(
  timeOf: (item: T) => number | null | undefined,
  tieBreak: (a: T, b: T) => number = () => 0,
): (a: T, b: T) => number {
  return (a, b) => {
    const ta = timeOf(a);
    const tb = timeOf(b);
    if (ta == null && tb == null) return tieBreak(a, b);
    if (ta == null) return 1;
    if (tb == null) return -1;
    if (tb !== ta) return tb - ta;
    return tieBreak(a, b);
  };
}

/**
 * The newest timestamp among `items` (Unix seconds), or `null` when none of
 * them carries one — the timestamp a repository files under.
 */
export function newestInstallTime<T>(
  items: readonly T[],
  timeOf: (item: T) => number | null | undefined,
): number | null {
  let newest: number | null = null;
  for (const item of items) {
    const t = timeOf(item);
    if (t == null) continue;
    if (newest == null || t > newest) newest = t;
  }
  return newest;
}

/**
 * File items into one group per calendar day that holds any, most recent
 * first. Items inside every day are ordered newest-first too; equal
 * timestamps keep their incoming order (the sort is stable), and the
 * 时间未知 group is never reordered — those items carry no order the
 * filesystem can prove.
 *
 * The input array itself is never mutated: the groups are freshly built and
 * only those fresh arrays are sorted.
 */
export function groupByInstallTime<T>(
  items: readonly T[],
  timeOf: (item: T) => number | null | undefined,
  now: Date = new Date(),
): TimeGroup<T>[] {
  const today = localMidnight(now);
  const byKey = new Map<
    string,
    { filing: DayFiling; start: number; items: T[] }
  >();
  const unknown: T[] = [];
  for (const item of items) {
    const seconds = timeOf(item);
    const filing = dayFilingOf(seconds, now);
    if (!filing || seconds == null || !Number.isFinite(seconds)) {
      unknown.push(item);
      continue;
    }
    // The day's own midnight is the sort anchor: a stable, comparable stand-in
    // for the calendar day, however far the stamps inside it spread.
    const start = localMidnight(new Date(Math.min(seconds * 1000, today)));
    const day = byKey.get(filing.key);
    if (day) day.items.push(item);
    else byKey.set(filing.key, { filing, start, items: [item] });
  }
  const groups: TimeGroup<T>[] = [...byKey.values()]
    .toSorted((a, b) => b.start - a.start)
    .map(({ filing, start, items: dayItems }) => {
      dayItems.sort(compareByInstalledTime(timeOf));
      return {
        key: filing.key,
        titleKey: filing.titleKey,
        start,
        items: dayItems,
      };
    });
  if (unknown.length > 0) {
    groups.push({
      key: "unknown",
      titleKey: "time.unknown",
      start: null,
      items: unknown,
    });
  }
  return groups;
}
