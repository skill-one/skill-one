import type { ReactNode } from "react";

/**
 * One quiet group of a grouped answer — the shell the ordering-metadata
 * groups render through: the installed list's per-day groups (今天, 09-15…)
 * and the store grid's rank bands (Top 25, 26–50…).
 *
 * A group like these carries no action — it only says what order the content
 * reads in — so its label is a whisper before the content, not a header over
 * it: one small muted line at the group's start, above its first row or
 * card. No rule, no chevron, no fold, no pinned bar, no count badge (the
 * search answer's source sections, whose grouping *is* worth acting on,
 * keep the full collapsible header — see `CollapsibleSection`).
 *
 * The wrapper stays a named `<section>`, so a group is still one landmark
 * for assistive tech (and one addressable region for the tests); the visible
 * label is `aria-hidden`, since the section's own name already carries it —
 * announcing both would read the label twice.
 */
export function GroupSection({
  label,
  children,
}: {
  /** The group's name, e.g. 今天 or Top 25. */
  label: string;
  /** The group's body; whatever the caller lists inside it. */
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <p aria-hidden="true" className="pb-2 text-xs text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}
