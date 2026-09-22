import { skillKey, type SkillView } from "../../lib/skill-view";
import { Sheet } from "../ui/sheet";
import { SkillDetailPanel, type SkillDetailSurface } from "./skill-detail-panel";

/**
 * The skill detail sheet shared by the store pages (explore, featured,
 * ranking) and the my-skills page: a modal right-side Sheet
 * (dimmed overlay; opening or closing never reflows the grid) with prev/next
 * walking the caller's list.
 *
 * The selection is a skill's identity (`skillKey`), not a position, so the
 * caller's rows can highlight the open skill and a list that regroups, grows
 * from the stream or shrinks under a removal keeps the panel on the skill the
 * reader opened — a skill that leaves the list closes it instead.
 * `surface` is the one thing the caller has to say about itself: the panel
 * offers the store's install CTA only for the store, and the installed list's
 * enable switch only for the installed list, so the drawer matches the card
 * the reader opened it from.
 */
export function SkillDetailDrawer({
  skills,
  selected,
  onSelect,
  onRemoved,
  surface,
}: {
  /** Flat list prev/next walks, in the order the page shows it. */
  skills: SkillView[];
  /** `skillKey` of the open skill; null keeps the drawer closed. */
  selected: string | null;
  /** Selects a skill by identity, or clears the selection with null. */
  onSelect: (key: string | null) => void;
  /** Called after the open skill is uninstalled; see `SkillRemoveButton`. */
  onRemoved?: () => void;
  /** Which listing owns the drawer; see `SkillDetailPanel`. */
  surface?: SkillDetailSurface;
}) {
  const index =
    selected == null
      ? -1
      : skills.findIndex((skill) => skillKey(skill) === selected);
  const selectedSkill = index === -1 ? null : skills[index];

  // Walking past either end simply does nothing: the panel is already on its
  // first or last skill.
  const goTo = (offset: number) => {
    const next = skills[index + offset];
    if (next) onSelect(skillKey(next));
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
        surface={surface}
        onPrev={() => goTo(-1)}
        onNext={() => goTo(1)}
        onRemoved={onRemoved}
      />
    </Sheet>
  );
}
