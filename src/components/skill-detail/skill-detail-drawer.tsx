import type { SkillView } from "../../lib/skill-view";
import { Drawer } from "../ui/drawer";
import { SkillDetailPanel, type SkillDetailSurface } from "./skill-detail-panel";

/**
 * The skill detail drawer shared by the store pages (explore, featured,
 * ranking) and the my-skills page: a modal right-side Drawer
 * (dimmed overlay; opening or closing never reflows the grid) with prev/next
 * walking the caller's list.
 *
 * The selection index stays in the caller so its rows can highlight the
 * open skill; a stale index (e.g. after a shrinking refetch) resolves to a
 * closed panel. `surface` is the one thing the caller has to say about itself
 * — the panel offers the store's install CTA only for the store, and the
 * installed list's enable switch only for the installed list — so the drawer
 * matches the card the reader opened it from.
 */
export function SkillDetailDrawer({
  skills,
  selected,
  onSelect,
  onRemoved,
  surface,
}: {
  /** Flat list that `selected` indexes into. */
  skills: SkillView[];
  /** Index into `skills` of the open skill; null keeps the drawer closed. */
  selected: number | null;
  /** Selects a skill index, or clears the selection with null. */
  onSelect: (index: number | null) => void;
  /** Called after the open skill is uninstalled; see `SkillRemoveButton`. */
  onRemoved?: () => void;
  /** Which listing owns the drawer; see `SkillDetailPanel`. */
  surface?: SkillDetailSurface;
}) {
  const selectedSkill = selected != null ? (skills[selected] ?? null) : null;

  const handlePrev = () => {
    if (selected != null) onSelect(Math.max(0, selected - 1));
  };
  const handleNext = () => {
    if (selected == null || selected + 1 >= skills.length) return;
    onSelect(selected + 1);
  };

  return (
    <Drawer
      direction="right"
      open={selectedSkill != null}
      onOpenChange={(open) => {
        if (!open) onSelect(null);
      }}
    >
      <SkillDetailPanel
        skill={selectedSkill}
        surface={surface}
        onPrev={handlePrev}
        onNext={handleNext}
        onRemoved={onRemoved}
      />
    </Drawer>
  );
}
