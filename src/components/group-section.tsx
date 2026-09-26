import type { ReactNode } from "react";

/**
 * One quiet group of a grouped answer — the shell the ordering-metadata
 * groups render through: the installed list's per-day groups (今天, 09-15…)
 * and the store grid's rank bands (Top 25, 26–50…).
 *
 * A group like these carries no action — it only says what order the content
 * reads in — so its label is a mark between the items, not a header over
 * them: no chevron, no fold, no pinned bar, no count badge (the search
 * answer's source sections, whose grouping *is* worth acting on, keep the
 * full collapsible header — see `CollapsibleSection`). The label is small,
 * muted text, drawn two ways by the shape of what it labels:
 *
 * - `divider` — for a single-column list: a hairline rule on each side of
 *   the label, so the boundary reads while the rows keep their own layout
 *   and rhythm untouched.
 * - `caption` — for a multi-column grid, where a full-width rule would slice
 *   between the cards: a small line sitting above the grid, left-aligned to
 *   its first column.
 *
 * The wrapper stays a named `<section>` either way, so a group is still one
 * landmark for assistive tech (and one addressable region for the tests);
 * the visible label is `aria-hidden`, since the section's own name already
 * carries it — announcing both would read the label twice.
 */
export function GroupSection({
  label,
  variant,
  children,
}: {
  /** The group's name, e.g. 今天 or Top 25. */
  label: string;
  /** `divider` for a one-column list, `caption` for a card grid. */
  variant: "divider" | "caption";
  /** The group's body; whatever the caller lists inside it. */
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      {variant === "divider" ? (
        <div
          aria-hidden="true"
          className="flex items-center gap-3 pb-3"
        >
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      ) : (
        <p
          aria-hidden="true"
          className="pb-3 text-xs text-muted-foreground"
        >
          {label}
        </p>
      )}
      {children}
    </section>
  );
}
