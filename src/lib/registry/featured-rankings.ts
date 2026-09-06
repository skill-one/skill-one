import { formatCount } from "../utils";
import type { Skill } from "../../types/skill";

/** Skills listed on each hero slide. */
export const HERO_RANK_SIZE = 3;

/** How many entries a leaderboard page shows. */
export const RANKING_SIZE = 100;

/**
 * Canonical skills.sh id of a skill (`{owner}/{repo}/{slug}`): the join key
 * between the registry and an upstream id list such as trending.json.
 */
export function skillIdOf(skill: Skill): string {
  return `${skill.repo}/${skill.name}`;
}

/** One ranked entry, shared by the hero slides and the leaderboard page. */
export interface RankEntry {
  /** 1-based position on the leaderboard. */
  rank: number;
  skill: Skill;
  /** Preformatted metric shown next to the name, e.g. "3.3M". */
  label: string;
}

/** One hero banner slide: a computed leaderboard plus its presentation. */
export interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  /** Tailwind gradient classes painting the slide background. */
  gradient: string;
  entries: RankEntry[];
}

/**
 * One leaderboard, fully described so the hero and the leaderboard page can
 * never disagree: both rank the same registry through the same `def`, only
 * taking a different slice of it.
 */
interface RankingDef {
  /** Stable identifier; also the leaderboard page's route param. */
  id: string;
  /** Leaderboard heading. */
  title: string;
  /** Hero-slide line, ending in the call to action. */
  subtitle: string;
  /** Tailwind gradient classes painting the hero slide background. */
  gradient: string;
  /**
   * Set for the order-driven leaderboard: entries come from an upstream id
   * list (trending.json, in upstream rank order) instead of a metric sort.
   */
  order?: "trending";
  /** The sort key, descending. Metric leaderboards only. */
  metric?: (skill: Skill) => number;
  /** Preformatted metric shown next to the name, e.g. "3.3M". */
  label: (skill: Skill) => string;
  /**
   * Lowest `metric` value that still ranks; defaults to 1. Ratio metrics sit
   * below 1, so they must lower or remove the floor.
   */
  min?: number;
}

/**
 * The leaderboards, in display order: the trending leaderboard (skills.sh's
 * own trending view, as an id list fetched alongside the index) and the
 * all-time popularity leaderboard (lifetime installs).
 */
export const RANKINGS: readonly RankingDef[] = [
  {
    id: "trending",
    title: "趋势热榜",
    subtitle: "skills.sh 官方趋势榜，点击查看完整榜单",
    gradient: "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400",
    order: "trending",
    label: (skill) => formatCount(skill.downloads),
  },
  {
    id: "popular",
    title: "人气总榜",
    subtitle: "安装量最高的经典 Skill，点击查看完整榜单",
    gradient: "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500",
    metric: (skill) => skill.downloads,
    label: (skill) => formatCount(skill.downloads),
  },
];

/** The leaderboard with this id; undefined for an unknown id. */
export function rankingById(id: string): RankingDef | undefined {
  return RANKINGS.find((ranking) => ranking.id === id);
}

/**
 * Rank `skills` by `def` and keep the first `limit` entries. `total` counts
 * everything that qualified, so a truncated leaderboard can still report how
 * many skills made the cut.
 *
 * Metric leaderboards sort by `def.metric` descending. The order-driven
 * trending leaderboard instead walks `trendingIds` — skills.sh's trending
 * rank — keeping only skills present in the registry; an absent or empty
 * list simply ranks nothing.
 */
export function rankSkills(
  skills: Skill[],
  def: RankingDef,
  limit: number,
  trendingIds?: readonly string[] | null,
): { entries: RankEntry[]; total: number } {
  if (def.order === "trending") {
    const byId = new Map(skills.map((skill) => [skillIdOf(skill), skill]));
    const pool = (trendingIds ?? [])
      .map((id) => byId.get(id))
      .filter((skill): skill is Skill => skill != null);
    const entries = pool
      .slice(0, limit)
      .map((skill, i) => ({ rank: i + 1, skill, label: def.label(skill) }));
    return { entries, total: pool.length };
  }
  const metric = def.metric ?? (() => 0);
  const floor = def.min ?? 1;
  const pool = skills.filter((skill) => metric(skill) >= floor);
  const entries = pool
    .toSorted((a, b) => metric(b) - metric(a))
    .slice(0, limit)
    .map((skill, i) => ({ rank: i + 1, skill, label: def.label(skill) }));
  return { entries, total: pool.length };
}

/**
 * Build the hero slides from the parsed registry index, in `RANKINGS` order,
 * showing only the top `HERO_RANK_SIZE` entries of each. Leaderboards with no
 * qualifying skill are dropped, so an empty or degenerate index — or a
 * missing trending list — yields fewer slides.
 */
export function buildHeroSlides(
  skills: Skill[],
  trendingIds?: readonly string[] | null,
): HeroSlide[] {
  return RANKINGS.map((def) => {
    const { entries } = rankSkills(skills, def, HERO_RANK_SIZE, trendingIds);
    return {
      id: def.id,
      title: def.title,
      subtitle: def.subtitle,
      gradient: def.gradient,
      entries,
    };
  }).filter((slide) => slide.entries.length > 0);
}
