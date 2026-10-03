import type { ReactNode } from "react";
import { SearchX, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * Centered "nothing to show" state with an optional retry action, shared by
 * every list page (search misses, load failures, empty lists).
 *
 * `data-slot="placeholder"` is the hook that tells this state apart from a
 * quiet inline one: a page that answers a search with a full-height empty state
 * above live results is making a claim its contents contradict, and that is a
 * distinction worth asserting by name rather than by the wording it happens to
 * be using this week.
 */
export function Placeholder({
  icon: Icon = SearchX,
  message,
  className,
  iconClassName,
  children,
}: {
  /** The state's glyph; defaults to the search-miss magnifier. */
  icon?: LucideIcon;
  message: string;
  /** Overrides the default full-height placement (compact containers). */
  className?: string;
  /** Merged onto the glyph: e.g. the spin an in-flight state asks for. */
  iconClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-slot="placeholder"
      className={cn(
        "flex h-full min-h-[320px] flex-col items-center justify-center gap-2 pb-[12vh] text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("h-8 w-8 opacity-40", iconClassName)} />
      <p className="text-[13px]">{message}</p>
      {children}
    </div>
  );
}
