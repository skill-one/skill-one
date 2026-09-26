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
 * The label is also the *only* thing at the boundary, and it costs the
 * layout nothing beyond a normal row gap: the callers drop the container
 * gap between sections, and this 16px label line (12px type, 2px breathing
 * each side) takes the gap's place — a group boundary measures exactly what
 * two adjacent rows measure, so grouping never stretches the rhythm. Don't
 * pair the sections with a `gap-*` container: that would stack the label on
 * top of the gap and reintroduce the bulge.
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
      <p
        aria-hidden="true"
        className="py-0.5 text-xs leading-none text-muted-foreground"
      >
        {label}
      </p>
      {children}
    </section>
  );
}
