import type { ParseKeys } from "i18next";
import type { AppLocale } from "../../lib/i18n-content";
import type { SkillMatched } from "../../components/highlighted-text";
import {
  domainLabel,
  fullTagEmoji,
  UNCLASSIFIED_DOMAIN,
} from "../../data/domains";
import { domainsOf, taxonomyRank } from "../../lib/domain-filter";
import {
  compareByInstalledTime,
  newestInstallTime,
} from "../../lib/install-time";
import { popularity } from "../../lib/popularity";
import { skillKey, type SkillView } from "../../lib/skill-view";
import type { LinkCandidate } from "../../lib/link-suggestions";

/** One installed skill, precomputed where the list is built. */
export interface Row {
  skill: SkillView;
  enabled: boolean;
  suggestion?: LinkCandidate[];
  /** Search-hit highlights, so a searched name reads like the store's. */
  matched?: SkillMatched;
}

/** One card's worth of installs: a repository, or the source-less pool. */
export interface RepoGroup {
  /** `owner/repo`, or "" for the pool of skills no source vouches for. */
  repo: string;
  items: Row[];
}

/** A titled section of installed skill rows (e.g. by time bucket or by tag). */
export interface InstalledSection {
  title: string;
  emoji?: string;
  rows: Row[];
  total?: number;
}

/**
 * The time buckets the install-clock grouping files installs into, newest
 * first. Each bucket holds the installs whose age (in whole days) falls below
 * its bound and above the previous one's — rolling windows, so 昨天 means "a
 * day or two old", not a calendar date. The last bucket takes everything
 * older, and an install whose record carries no timestamp reads last (see
 * `compareByInstalledTime`) and files there too: an unreadable clock is not a
 * fresh one.
 */
export const TIME_BUCKETS: { titleKey: ParseKeys; maxAgeDays: number | null }[] = [
  { titleKey: "list.bucketToday", maxAgeDays: 1 },
  { titleKey: "list.bucketYesterday", maxAgeDays: 2 },
  { titleKey: "list.bucketLast7", maxAgeDays: 7 },
  { titleKey: "list.bucketLast30", maxAgeDays: 30 },
  { titleKey: "list.bucketEarlier", maxAgeDays: null },
];

/** One day, in seconds — `installedAt` is a Unix-seconds stamp. */
export const DAY_SECONDS = 86_400;

/** React-key identity of the pool card: skills no recorded source vouches for. */
export const LOCAL_POOL_KEY = "local";

/**
 * The stars a card's bar shows: the registry's figure, and only when the card's
 * source resolved to a store entry. An install the registry cannot place has no
 * figure to state, which is not the same as a figure of zero. The figure is
 * read from whichever row resolved — the card files by its newest install, so
 * that row is no longer necessarily the one the registry placed.
 */
export function starsOf(group: RepoGroup): number | undefined {
  const backed = group.items.find((row) => row.skill.storeBacked);
  return backed ? backed.skill.stars : undefined;
}

/**
 * The comparator behind the 热度 sort: the registry's blended
 * installs-and-stars figure, most-popular first, and an equal figure falls
 * back to the install's own clock, newest first — the order the list was born
 * answering in, so the fallback never surprises. `popularityOf` reads a plain
 * number (a row the registry does not back carries no figure at all and reads
 * 0: such a row simply sinks, never borrowing stars it cannot show).
 */
export function compareByPopularity<T>(
  popularityOf: (item: T) => number,
  timeOf: (item: T) => number | null | undefined,
  tieBreak: (a: T, b: T) => number = () => 0,
): (a: T, b: T) => number {
  return (a, b) => {
    const pa = popularityOf(a);
    const pb = popularityOf(b);
    if (pa !== pb) return pb - pa;
    return compareByInstalledTime(timeOf, tieBreak)(a, b);
  };
}

/** A row's name, the tie-break both sorts share inside the flat lists. */
export const byName = (a: Row, b: Row) => a.skill.name.localeCompare(b.skill.name);

/**
 * Whether a row's skill takes part in the collection. Named once at module level
 * so the two splits can depend on it stably.
 */
export const isRowEnabled = (row: Row) => row.enabled;

/**
 * The comparator behind the 按仓库 sort: the most-starred repository leads,
 * and the figure-less cards — the source-less pool, or a source the registry
 * no longer lists — sink below every figure. Cards the stars cannot separate
 * (equal figures, all figures absent) fall back to the newest-install order
 * the repository reading was born with, then to the name.
 */
export function compareByStars<T>(
  figureOf: (item: T) => number | undefined,
  fallback: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const sa = figureOf(a);
    const sb = figureOf(b);
    if (sa == null && sb == null) return fallback(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sa !== sb) return sb - sa;
    return fallback(a, b);
  };
}

/**
 * Groups installed skill rows into repository groups.
 */
export function groupRowsByRepo(rows: Row[]): RepoGroup[] {
  const byRepo = new Map<string, Row[]>();
  for (const row of rows) {
    const bucket = byRepo.get(row.skill.repo);
    if (bucket) bucket.push(row);
    else byRepo.set(row.skill.repo, [row]);
  }
  return Array.from(byRepo, ([repo, items]) => ({
    repo,
    items: items.toSorted(
      compareByInstalledTime((row) => row.skill.installedAt, byName),
    ),
  })).toSorted((a, b) => a.repo.localeCompare(b.repo));
}

/**
 * Sorts repository groups with local/unsourced card pinned first, followed by stars order.
 */
export function sortRepoGroups(cards: RepoGroup[]): RepoGroup[] {
  const byNewestInstall = compareByInstalledTime<RepoGroup>(
    (card) => newestInstallTime(card.items, (row) => row.skill.installedAt),
    (a, b) => a.repo.localeCompare(b.repo),
  );
  return cards.toSorted((a, b) => {
    const isLocalA = !a.repo;
    const isLocalB = !b.repo;
    if (isLocalA && !isLocalB) return -1;
    if (!isLocalA && isLocalB) return 1;
    return compareByStars((card) => starsOf(card), byNewestInstall)(a, b);
  });
}

/**
 * Sorts installed rows according to the chosen sort strategy:
 * - "installed": newest install time first
 * - "tag": grouped by primary tag (unclassified first, then by frequency, taxonomy rank, and label), popularity within
 * - "popularity": most popular first, fallback to install time
 */
export function sortSkillRows(
  rows: Row[],
  sort: string,
  locale: AppLocale,
  isSearching: boolean,
): Row[] {
  if (isSearching) return rows;
  if (sort === "installed") {
    return rows.toSorted(
      compareByInstalledTime((row) => row.skill.installedAt),
    );
  }
  if (sort === "tag") {
    const tagCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.enabled) {
        const key = domainsOf(row.skill)[0];
        tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
      }
    }
    return rows.toSorted((a, b) => {
      const tagA = domainsOf(a.skill)[0];
      const tagB = domainsOf(b.skill)[0];
      if (tagA !== tagB) {
        if (tagA === UNCLASSIFIED_DOMAIN) return -1;
        if (tagB === UNCLASSIFIED_DOMAIN) return 1;
        const countA = tagCounts.get(tagA) ?? 0;
        const countB = tagCounts.get(tagB) ?? 0;
        if (countA !== countB) return countB - countA;
        const rankA = taxonomyRank(tagA);
        const rankB = taxonomyRank(tagB);
        if (rankA !== rankB) return rankA - rankB;
        const labelDiff = domainLabel(tagA, locale).localeCompare(
          domainLabel(tagB, locale),
        );
        if (labelDiff !== 0) return labelDiff;
      }
      return compareByPopularity(
        (row: Row) => popularity(row.skill),
        (row: Row) => row.skill.installedAt,
        byName,
      )(a, b);
    });
  }
  return rows.toSorted(
    compareByPopularity(
      (row) => popularity(row.skill),
      (row) => row.skill.installedAt,
      byName,
    ),
  );
}

/**
 * Builds semantic sections for live installed skills (e.g. by tag or by time buckets).
 */
export function buildInstalledSections({
  liveRows,
  liveActiveRows,
  sort,
  locale,
  t,
}: {
  liveRows: Row[];
  liveActiveRows: Row[];
  sort: string;
  locale: AppLocale;
  t: (key: ParseKeys) => string;
}): InstalledSection[] {
  if (liveRows.length === 0) return [];

  if (sort === "tag") {
    const activeByTag = new Map<string, Row[]>();
    for (const row of liveActiveRows) {
      const key = domainsOf(row.skill)[0];
      const bucket = activeByTag.get(key);
      if (bucket) bucket.push(row);
      else activeByTag.set(key, [row]);
    }

    const orderedTags = Array.from(activeByTag.entries()).toSorted(
      ([keyA, itemsA], [keyB, itemsB]) => {
        if (keyA === UNCLASSIFIED_DOMAIN) return -1;
        if (keyB === UNCLASSIFIED_DOMAIN) return 1;
        return (
          itemsB.length - itemsA.length ||
          taxonomyRank(keyA) - taxonomyRank(keyB) ||
          domainLabel(keyA, locale).localeCompare(domainLabel(keyB, locale))
        );
      },
    );

    const shownByTag = new Map<string, Row[]>();
    for (const row of liveRows) {
      const key = domainsOf(row.skill)[0];
      const bucket = shownByTag.get(key);
      if (bucket) bucket.push(row);
      else shownByTag.set(key, [row]);
    }

    const groups: InstalledSection[] = [];
    for (const [key] of orderedTags) {
      const tagRows = shownByTag.get(key);
      if (tagRows && tagRows.length > 0) {
        groups.push({
          title: domainLabel(key, locale),
          emoji: fullTagEmoji(key),
          rows: tagRows,
          total: activeByTag.get(key)?.length ?? tagRows.length,
        });
      }
    }
    return groups;
  }

  if (sort === "installed") {
    const buckets: Row[][] = TIME_BUCKETS.map(() => []);
    for (const row of liveRows) {
      const stamp = row.skill.installedAt;
      const ageDays =
        stamp == null ? null : (Date.now() / 1000 - stamp) / DAY_SECONDS;
      const index =
        ageDays == null
          ? TIME_BUCKETS.length - 1
          : TIME_BUCKETS.findIndex(
              (bucket) =>
                bucket.maxAgeDays !== null && ageDays < bucket.maxAgeDays,
            );
      buckets[index === -1 ? TIME_BUCKETS.length - 1 : index].push(row);
    }
    return TIME_BUCKETS.map((bucket, index) => ({
      title: t(bucket.titleKey),
      rows: buckets[index],
    })).filter((section) => section.rows.length > 0);
  }

  return [];
}

/**
 * Computes display ordinals for rows across tag sections or flat groups.
 */
export function buildRowOrdinals(
  sort: string,
  sections: InstalledSection[],
  splitRows: { enabled: Row[]; disabled: Row[] },
): Map<string, number> {
  const ordinals = new Map<string, number>();
  if (sort === "tag") {
    for (const section of sections) {
      section.rows.forEach((row, index) =>
        ordinals.set(skillKey(row.skill), index),
      );
    }
    splitRows.disabled.forEach((row, index) =>
      ordinals.set(skillKey(row.skill), index),
    );
  } else {
    for (const group of [splitRows.enabled, splitRows.disabled]) {
      group.forEach((row, index) => ordinals.set(skillKey(row.skill), index));
    }
  }
  return ordinals;
}
