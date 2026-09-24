import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";

/**
 * One section of a composite answer — the shared header row of the unified
 * search view's three sections (installed, store, skills.sh).
 *
 * The header is the section's anchor, so it carries the three things a reader
 * tells sections apart by, in the order the eye reads them: the section's own
 * glyph (a fixed icon per source — the fastest scan anchor when three
 * same-shaped sections stack), the title, and the count as a quiet badge
 * riding the title rather than drifting to the far edge it used to sit at.
 *
 * The header pins to the top of the scrolling container while its section
 * passes (`sticky`, same behavior as the grouped-list shell's `GroupSection`),
 * so a long answer never loses track of which section it is in — and the two
 * modes (browsing, searching) read the same way.
 */
export function SectionHeader({
  icon: Icon,
  title,
  count,
  className,
}: {
  /** The section's glyph; one fixed icon per source. */
  icon?: LucideIcon;
  /** The section's name, e.g. 应用商店. */
  title: string;
  /** The section's own count phrase, e.g. 3 个仓库. */
  count: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex w-full items-center gap-2 bg-background px-1 py-2",
        className,
      )}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      )}
      <span className="truncate text-sm font-semibold">{title}</span>
      <Badge variant="secondary" className="shrink-0 tabular-nums">
        {count}
      </Badge>
    </div>
  );
}
