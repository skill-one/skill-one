import type { ReactNode } from "react";
import { SearchX, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * Centered "nothing to show" state with an optional retry action, shared by
 * every list page (search misses, load failures, empty lists).
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
