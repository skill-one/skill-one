import { formatCount } from "../utils";
import type { Skill } from "../../types/skill";

/** Skills listed on each hero slide. */
export const HERO_RANK_SIZE = 3;

/** How many entries a leaderboard page shows. */
export const RANKING_SIZE = 100;

/**
 * Minimum lifetime installs for the rising leaderboard. Without this floor
 * the weekly/lifetime ratio is dominated by brand-new skills with a handful
 * of installs rather than genuinely fast-growing ones.
 */
const RISING_MIN_DOWNLOADS = 10_000;

/** One ranked entry, shared by the hero slides and the leaderboard page. */
export interface RankEntry {
  /** 1-based position on the leaderboard. */
  rank: number;
  skill: Skill;
  /** Preformatted metric shown next to the name, e.g. "113.8K/周". */
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
 * never disagree: both rank the same registry with the same `metric` and
 * print the same `label`, only taking a different slice of it.
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
  /** Pre-filter excluding skills that cannot rank (e.g. too new to rise). */
  filter?: (skill: Skill) => boolean;
  /** The sort key, descending. */
  metric: (skill: Skill) => number;
  /** Preformatted metric shown next to the name, e.g. "113.8K/周". */
  label: (skill: Skill) => string;
  /**
   * Lowest `metric` value that still ranks; defaults to 1. Ratio metrics sit
   * below 1, so they must lower or remove the floor.
   */
  min?: number;
}

/** Number of installs recorded over the most recent week. */
const weekly = (skill: Skill) => skill.weeklyInstalls ?? 0;

/**
 * The leaderboards, in display order: the weekly leaderboard (current-week
 * installs), the all-time popularity leaderboard (lifetime installs) and the
 * rising leaderboard (highest share of installs coming from the current
 * week).
 */
export const RANKINGS: readonly RankingDef[] = [
  {
    id: "weekly",
    title: "Skill 周榜",
    subtitle: "每周精选热门 Skill，点击查看完整榜单",
    gradient: "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400",
    metric: weekly,
    label: (skill) => `${formatCount(weekly(skill))}/周`,
  },
  {
    id: "popular",
    title: "人气总榜",
    subtitle: "安装量最高的经典 Skill，点击查看完整榜单",
    gradient: "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500",
    metric: (skill) => skill.downloads,
    label: (skill) => formatCount(skill.downloads),
  },
  {
    id: "rising",
    title: "新晋热门",
    subtitle: "本周增长最快的新星 Skill，点击查看完整榜单",
    gradient: "bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500",
    filter: (skill) => skill.downloads >= RISING_MIN_DOWNLOADS,
    metric: (skill) => weekly(skill) / Math.max(skill.downloads, 1),
    label: (skill) => `${formatCount(weekly(skill))}/周`,
    // The floor is the download pre-filter; ratios sit below 1, so the
    // default "metric >= 1" cutoff would empty the leaderboard.
    min: 0,
  },
];

/** The leaderboard with this id; undefined for an unknown id. */
export function rankingById(id: string): RankingDef | undefined {
  return RANKINGS.find((ranking) => ranking.id === id);
}

/**
 * Rank `skills` by `def`, descending, and keep the first `limit` entries.
 * `total` counts everything that clears the floor, so a truncated
 * leaderboard can still report how many skills qualified.
 */
export function rankSkills(
  skills: Skill[],
  def: RankingDef,
  limit: number,
): { entries: RankEntry[]; total: number } {
  const floor = def.min ?? 1;
  const pool = skills.filter(
    (skill) => (!def.filter || def.filter(skill)) && def.metric(skill) >= floor,
  );
  const entries = pool
    .toSorted((a, b) => def.metric(b) - def.metric(a))
    .slice(0, limit)
    .map((skill, i) => ({ rank: i + 1, skill, label: def.label(skill) }));
  return { entries, total: pool.length };
}

/**
 * Build the hero slides from the parsed registry index, in `RANKINGS` order,
 * showing only the top `HERO_RANK_SIZE` entries of each. Leaderboards with no
 * qualifying skill are dropped, so an empty or degenerate index yields fewer
 * slides.
 */
export function buildHeroSlides(skills: Skill[]): HeroSlide[] {
  return RANKINGS.map((def) => {
    const { entries } = rankSkills(skills, def, HERO_RANK_SIZE);
    return {
      id: def.id,
      title: def.title,
      subtitle: def.subtitle,
      gradient: def.gradient,
      entries,
    };
  }).filter((slide) => slide.entries.length > 0);
}
