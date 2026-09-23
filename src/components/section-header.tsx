import { cn } from "../lib/utils";

/**
 * One section of a composite answer — the shared header row of the unified
 * search view's three sections (installed, store, skills.sh), in the same
 * quiet typography the live section pioneered: the title, a one-line aside
 * saying where the rows come from, and the count pinned to the far edge.
 *
 * Deliberately not the grouped-list shell (`GroupSection`): a section of the
 * search answer has nothing to fold and nothing to pin — it is one answer
 * among a few, read top to bottom, and the header is only its label.
 */
export function SectionHeader({
  title,
  note,
  count,
  className,
}: {
  /** The section's name, e.g. 应用商店. */
  title: string;
  /** A quiet aside after the title: where this section's rows come from. */
  note?: string;
  /** The section's own count phrase, e.g. 3 个仓库. */
  count: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md px-1 py-2",
        className,
      )}
    >
      <span className="truncate text-sm font-medium">{title}</span>
      {note && (
        <span className="shrink-0 text-xs text-muted-foreground">{note}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        <span>{count}</span>
      </span>
    </div>
  );
}
