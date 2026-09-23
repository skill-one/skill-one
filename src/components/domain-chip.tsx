import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

/**
 * One press of a domain filter: a chip that scopes a list to a domain (or, for
 * 全部, clears the scope). Shared by the store's browse list and the installed
 * list, so both surfaces' filter bar is the same control.
 *
 * At rest a chip shows only its glyph, so the bar reads as a line of emoji and a
 * dozen domains stay scannable at a glance. Pointing at one names it in a tip —
 * nothing in the row moves; the label only unfolds once the chip is pressed, and
 * stays open so the current scope is always named. The label is clipped rather
 * than unmounted, so the chip's accessible name is complete with no pointer.
 * 全部 carries no glyph, so it keeps its label at rest (and carries no tip).
 */
export function DomainChip({
  selected,
  emoji,
  count,
  countLabel = "个仓库",
  expanded = false,
  onClick,
  children,
}: {
  selected: boolean;
  emoji?: string;
  count?: number;
  /** What the count counts, named in the tip (e.g. 个 skill). */
  countLabel?: string;
  /** Keep the label visible at rest, for a chip with no glyph to stand for it. */
  expanded?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const revealed = selected || expanded;
  const chip = (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      size="sm"
      aria-pressed={selected}
      onClick={onClick}
    >
      {/* One child, so the button's own gap never widens the collapsed chip:
          the emoji and the clipped label meet the padding symmetrically. */}
      <span className="flex items-center">
        {emoji && (
          <span aria-hidden="true" className="text-[13px] leading-none">
            {emoji}
          </span>
        )}
        <span
          className={cn(
            "grid items-center transition-[grid-template-columns] duration-150",
            revealed ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
          )}
        >
          <span className="overflow-hidden">
            <span className="flex items-center gap-1 pl-1.5 whitespace-nowrap">
              {children}
              {count !== undefined && (
                <span className="text-[11px] tabular-nums opacity-70">
                  {count}
                </span>
              )}
            </span>
          </span>
        </span>
      </span>
    </Button>
  );

  // A chip at rest is a bare glyph, so hovering names it in a tip rather than
  // unfolding the row — a row that shifts under the pointer is hard to scan.
  // The label unfolds only once the chip is chosen. A chip already showing its
  // label carries no tip.
  if (revealed) return chip;
  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent>
        {children}
        {count !== undefined && ` · ${count} ${countLabel}`}
      </TooltipContent>
    </Tooltip>
  );
}
