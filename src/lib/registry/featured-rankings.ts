import { formatCount } from "../utils";
import type { Skill } from "../../types/skill";

/** Skills listed on each hero slide. */
export const HERO_RANK_SIZE = 3;

/**
 * Minimum lifetime installs for the rising leaderboard. Without this floor
 * the weekly/lifetime ratio is dominated by brand-new skills with a handful
 * of installs rather than genuinely fast-growing ones.
 */
const RISING_MIN_DOWNLOADS = 10_000;

/** One ranked entry on a hero slide. */
export interface HeroRankEntry {
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
  entries: HeroRankEntry[];
}

type Metric = (skill: Skill) => number;
type MetricLabel = (skill: Skill) => string;

/**
 * Top skills by `metric`, in descending order. Skills scoring below `min`
 * are not ranked, so empty leaderboards stay droppable at the call site.
 */
function rank(
  skills: Skill[],
  metric: Metric,
  label: MetricLabel,
  min = 1,
): HeroRankEntry[] {
  return [...skills]
    .filter((skill) => metric(skill) >= min)
    .sort((a, b) => metric(b) - metric(a))
    .slice(0, HERO_RANK_SIZE)
    .map((skill, i) => ({ rank: i + 1, skill, label: label(skill) }));
}

/**
 * Build the hero slides from the parsed registry index, in display order:
 * the weekly leaderboard (current-week installs), the all-time popularity
 * leaderboard (lifetime installs) and the rising leaderboard (highest share
 * of installs coming from the current week). Leaderboards with no qualifying
 * skill are dropped, so an empty or degenerate index yields fewer slides.
 */
export function buildHeroSlides(skills: Skill[]): HeroSlide[] {
  const weekly = (skill: Skill) => skill.weeklyInstalls ?? 0;
  const slides: HeroSlide[] = [
    {
      id: "weekly",
      title: "Skill 周榜",
      subtitle: "每周精选热门 Skill，点击查看完整榜单",
      gradient: "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400",
      entries: rank(skills, weekly, (skill) => `${formatCount(weekly(skill))}/周`),
    },
    {
      id: "popular",
      title: "人气总榜",
      subtitle: "安装量最高的经典 Skill，点击查看完整榜单",
      gradient: "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500",
      entries: rank(skills, (skill) => skill.downloads, (skill) =>
        formatCount(skill.downloads),
      ),
    },
    {
      id: "rising",
      title: "新晋热门",
      subtitle: "本周增长最快的新星 Skill，点击查看完整榜单",
      gradient: "bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500",
      entries: rank(
        skills.filter((skill) => skill.downloads >= RISING_MIN_DOWNLOADS),
        (skill) => weekly(skill) / Math.max(skill.downloads, 1),
        (skill) => `${formatCount(weekly(skill))}/周`,
        // The floor is the download pre-filter; ratios sit below 1, so the
        // default "metric >= 1" cutoff would empty the leaderboard.
        0,
      ),
    },
  ];
  return slides.filter((slide) => slide.entries.length > 0);
}
