import { cn } from "../lib/utils";

/**
 * Numeric badge at the head of a skill row: a leaderboard's rank or a plain
 * list's serial number. With `podium`, the top three get a tinted chip and a
 * heavier weight, so the eye lands on the podium first without the list
 * turning into a wall of accents; plain lists keep the neutral style.
 */
export function RankBadge({
  rank,
  podium = false,
}: {
  /** 1-based position in the list the row belongs to. */
  rank: number;
  /** Tint the top three like the leaderboards do; off for plain lists. */
  podium?: boolean;
}) {
  const tint =
    !podium
      ? null
      : rank === 1
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : rank === 2
          ? "bg-slate-500/15 text-slate-600 dark:text-slate-300"
          : rank === 3
            ? "bg-amber-700/15 text-amber-800 dark:text-amber-600"
            : null;

  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] tabular-nums",
        tint ?? "text-muted-foreground/70",
        tint ? "font-bold" : "font-medium",
      )}
    >
      {rank}
    </span>
  );
}
