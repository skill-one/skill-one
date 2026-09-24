import { cn } from "./utils";

/**
 * The podium ink for the first three of a ranked list: gold, silver, bronze —
 * the one thing every ordinal in the app shares, wherever a ranked list prints
 * one (a collection page's list row, `SkillRow`).
 */
export const MEDAL_CLASSES = [
  "text-amber-500 dark:text-amber-400",
  "text-slate-400 dark:text-slate-500",
  "text-orange-600 dark:text-orange-400",
];

/**
 * Ink for one ordinal, `index` zero-based: a medalled color for a ranked
 * list's top three and quiet muted ink everywhere else. Size and placement
 * stay with the caller — a group header and a list row print their number at
 * different scales — so this is only ever appended to the caller's own span.
 *
 * `ranked = false` opts a list out of the podium: a sequence that carries no
 * ranking (a timeline, or a repository's own skills read top to bottom) is
 * merely enumerated, and a medal on its first row would imply it won
 * something.
 */
export function ordinalClass(index: number, ranked = true): string {
  const medal = ranked ? MEDAL_CLASSES[index] : undefined;
  return medal
    ? cn("font-bold tabular-nums", medal)
    : "text-muted-foreground tabular-nums";
}
