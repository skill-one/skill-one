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
 * At rest a chip shows its glyph and its count, so the bar reads as a line of
 * figures over emoji and the reader can weigh the domains without pressing any
 * of them. Pointing at one names it in a tip — nothing in the row moves; the
 * label only unfolds once the chip is pressed, and stays open so the current
 * scope is always named. The label is clipped rather than unmounted, so the
 * chip's accessible name is complete with no pointer. 全部 carries no glyph, so
 * it keeps its label at rest (and carries no tip).
 */
export function DomainChip({
  selected,
  emoji,
  count,
  expanded = false,
  onClick,
  children,
}: {
  selected: boolean;
  emoji?: string;
  count?: number;
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
          the glyph and the count meet the padding symmetrically. */}
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
            <span className="pl-1.5 whitespace-nowrap">{children}</span>
          </span>
        </span>
        {/* The count stands outside the collapsing label: it answers at rest,
            before any press, how much each scope holds. */}
        {count !== undefined && (
          <span className="pl-1.5 text-[11px] tabular-nums opacity-70">
            {count}
          </span>
        )}
      </span>
    </Button>
  );

  // A chip at rest is a glyph and a figure, so hovering names it in a tip
  // rather than unfolding the row — a row that shifts under the pointer is hard
  // to scan. The label unfolds only once the chip is chosen. A chip already
  // showing its label carries no tip.
  if (revealed) return chip;
  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
