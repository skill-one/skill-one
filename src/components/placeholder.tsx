import type { ReactNode } from "react";
import { SearchX } from "lucide-react";

/**
 * Centered "nothing to show" state with an optional retry action, shared by
 * every list page (search misses, load failures, empty lists).
 */
export function Placeholder({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 pb-[12vh] text-muted-foreground">
      <SearchX className="h-8 w-8 opacity-40" />
      <p className="text-[13px]">{message}</p>
      {children}
    </div>
  );
}
