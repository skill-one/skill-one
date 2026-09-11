import { Download, Flame, Star } from "lucide-react";
import type { ComponentProps } from "react";

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
          <Flame className="h-3.5 w-3.5" />
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
