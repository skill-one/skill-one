import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { LayoutGrid, Rows3 } from "lucide-react";

import { cn } from "../lib/utils";
import type { ListUnit } from "../lib/list-view";
import { segmentedItemVariants, segmentedTrackVariants } from "./segmented";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/** The two shapes, in the order the switch offers them: rows first. */
const UNITS: readonly { unit: ListUnit; labelKey: ParseKeys }[] = [
  { unit: "skill", labelKey: "unit.list" },
  { unit: "repo", labelKey: "unit.cards" },
];

/**
 * The shape switch of a list that can be read in more than one shape — both
 * lists, today. A segmented pair of toggles rather than a third select beside
 * the other two, and the difference is what the control is: this is not a value
 * read out of a set but a choice between two visible arrangements, so both
 * answers stand on the row at once, the pressed one says which, and switching
 * costs one press and no popup. That is the whole argument for it, and it is
 * why the shape never belonged in the sort: a select would have made the
 * arrangement the fourth thing to open a menu to discover.
 *
 * The shapes are drawn rather than named, because they are two silhouettes of
 * the same list and the icon is what tells them apart at a glance; each carries
 * its name for anyone who cannot see it (a screen reader reads "列表"/"卡片"),
 * and the pair is labelled as the one thing it decides — the layout.
 *
 * Unlike the scope and the order, this stands down for nothing: a search answers
 * in sections, and the sections are read in the shape the reader chose, so the
 * switch keeps its answer while a query is live.
 *
 * It wears the app's one segmented look (`segmented`), the same one the header's
 * destinations wear, and it wears it as a track rather than as a pair of outline
 * buttons: a toggle group's own selected shade is `bg-muted`, which is also the
 * shade an unselected half darkens *to* on hover, so on its own this switch could
 * not tell the reader which half was chosen. The raised half — surface colour
 * under one quiet shadow, out of a muted bed — can, and it is the same signal the
 * header's marked destination gives. So the halves drop `variant="outline"`: a
 * border belongs to a button that stands alone, and these two never do.
 */
export function ListUnitToggle({
  unit,
  onChange,
  disabled = false,
  className,
}: {
  /** The shape on screen. */
  unit: ListUnit;
  /** Called with the shape the reader picked; never with the current one. */
  onChange: (unit: ListUnit) => void;
  /** Reserved for a list whose shape is not the reader's to pick. */
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <ToggleGroup
      value={[unit]}
      disabled={disabled}
      // Not the library's `spacing={0}`: that is a run of halves joined edge to
      // edge with the outer corners rounded for a borderless outline, and it
      // carries its own gap and corner rules that would fight the shared track.
      // The track owns the air between the halves instead (see `segmented`).
      spacing={1}
      aria-label={t("common.listLayout")}
      className={cn(segmentedTrackVariants(), "shrink-0", className)}
      onValueChange={(value) => {
        // Clicking the pressed shape presses nothing: a shape is chosen, not
        // toggled off, so the pair never leaves the list with neither answer.
        const [next] = value as ListUnit[];
        if (next !== undefined && next !== unit) onChange(next);
      }}
    >
      {UNITS.map(({ unit: value, labelKey }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          size="sm"
          aria-label={t(labelKey)}
          // The raised look rides the state Base UI writes onto the element, so
          // the pressed half is the raised one without this component having to
          // know which half that is.
          className={segmentedItemVariants({ active: "toggle" })}
        >
          {value === "skill" ? (
            <Rows3 aria-hidden />
          ) : (
            <LayoutGrid aria-hidden />
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}