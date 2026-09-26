import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * A fold between two sections of one list, drawn as a rule across the list
 * rather than a button beneath it: one section ends where the rule begins, the
 * next begins where it ends. One press unfolds the next section beneath; a
 * second folds it away again, and the rule stays exactly where it was. The two
 * hairlines flank the rule's own label, which states exactly what unfolding
 * adds.
 */
export function FoldRule({
  controls,
  open,
  closedLabel,
  openLabel,
  onToggle,
}: {
  /** The folded list this rule governs (for `aria-controls`). */
  controls: string;
  /** Whether the section it folds is currently mounted. */
  open: boolean;
  /** The rule's label while the section is folded away. */
  closedLabel: string;
  /** The rule's label while the section is unfolded. */
  openLabel: string;
  /** Toggle the fold. */
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="group flex w-full items-center gap-3 rounded-md px-1 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="h-px flex-1 bg-border transition-colors group-hover:bg-foreground/30"
      />
      <span className="flex shrink-0 items-center gap-1.5">
        {open ? (
          <>
            <ChevronUp className="size-3.5" aria-hidden />
            {openLabel}
          </>
        ) : (
          <>
            <ChevronDown className="size-3.5" aria-hidden />
            {closedLabel}
          </>
        )}
      </span>
      <span
        aria-hidden
        className="h-px flex-1 bg-border transition-colors group-hover:bg-foreground/30"
      />
    </button>
  );
}
