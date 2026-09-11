import { Download, Flame, Star } from "lucide-react";
import { useId, type ComponentProps } from "react";

import { popularity } from "../lib/popularity";
import { cn, formatCount } from "../lib/utils";
import type { Skill } from "../types/skill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

/**
 * The registry's one popularity figure, shared by every skill surface (list
 * rows and the detail drawer header) so the number on a row and the number
 * in the detail can never disagree.
 *
 * The trigger shows the blended `popularity(skill)` with a flame; hovering or
 * focusing breaks it back down into the installs and stars it blends, each
 * icon standing in for its label. The figure is not a count of anything, so
 * it carries no unit and its accessible name always spells the breakdown out:
 * `热度 …：安装 … · Star …`.
 */
export function SkillPopularity({
  skill,
  className,
  side = "top",
  align = "center",
}: {
  skill: Skill;
  className?: string;
  /** Tooltip placement: list rows open it to the right, headers on top. */
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
}) {
  // Formatted once: the trigger, its accessible name and the tooltip lines
  // all read these, so they cannot disagree about what the figure is.
  const installed = formatCount(skill.downloads);
  const starred = formatCount(skill.stars);
  const blended = formatCount(popularity(skill));

  // A flame reads warm, so the metric's icon is filled with an orange→amber
  // gradient (rather than the neutral grey of the rest of the row). The id is
  // scoped per instance via useId (sanitized: ':' is unstable inside url(#..))
  // so the many rows on a list can each carry their own defs without clashing.
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger
          aria-label={`热度 ${blended}：安装 ${installed} · Star ${starred}`}
          // The metric is commonly embedded in a clickable surface (a list
          // row opens the detail panel); a click on the figure stays there.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex shrink-0 cursor-default items-center gap-1 rounded text-[12px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
        >
          <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
            <svg aria-hidden="true" focusable="false" className="absolute h-0 w-0">
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  {/* tip amber → base orange, so the outline reads as fire */}
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
            </svg>
            <Flame className="h-3.5 w-3.5" color={`url(#${gradientId})`} />
          </span>
          <span className="font-medium tabular-nums">{blended}</span>
        </TooltipTrigger>
        <TooltipContent side={side} align={align}>
          {/* One-line breakdown: the trigger already shows the blend, so the
              tooltip reveals only the two counts behind it. */}
          <div className="flex items-center gap-1.5 text-[12px]">
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="tabular-nums">{installed}</span>
            <span aria-hidden="true" className="text-background/55">
              ·
            </span>
            <Star aria-hidden="true" className="h-3.5 w-3.5 text-amber-400" />
            <span className="tabular-nums">{starred}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
