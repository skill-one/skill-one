import type { Skill } from "../../types/skill";
import { Sheet } from "../../components/ui/sheet";
import { SkillDetailPanel } from "./skill-detail-panel";

/**
 * The skill detail drawer shared by the explore and featured pages: a modal
 * Sheet (dimmed overlay; opening or closing never reflows the grid) with
 * prev/next walking the caller's list.
 *
 * The selection index stays in the caller so its cards can highlight the
 * open skill; a stale index (e.g. after a shrinking refetch) resolves to a
 * closed panel.
 */
export function SkillDetailSheet({
  skills,
  selected,
  onSelect,
}: {
  /** Flat list that `selected` indexes into. */
  skills: Skill[];
  /** Index into `skills` of the open skill; null keeps the sheet closed. */
  selected: number | null;
  /** Selects a skill index, or clears the selection with null. */
  onSelect: (index: number | null) => void;
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
    <Sheet
      open={selectedSkill != null}
      onOpenChange={(open) => {
        if (!open) onSelect(null);
      }}
    >
      <SkillDetailPanel
        skill={selectedSkill}
        onPrev={handlePrev}
        onNext={handleNext}
      />
    </Sheet>
  );
}
