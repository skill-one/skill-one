import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { Layers, LayoutGrid, Rows3 } from "lucide-react";

import { cn } from "../lib/utils";
import type { ListUnit } from "../lib/list-view";
import { segmentedItemVariants, segmentedTrackVariants } from "./segmented";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/** The three shapes, in the order the switch offers them: rows first. */
const UNITS: readonly { unit: ListUnit; labelKey: ParseKeys }[] = [
  { unit: "skill", labelKey: "unit.list" },
  { unit: "grid", labelKey: "unit.grid" },
  { unit: "repo", labelKey: "unit.repos" },
];

/**
 * The shape switch of a list that can be read in more than one shape — both
 * lists, today. A segmented row of toggles rather than a third select beside
 * the other two, and the difference is what the control is: this is not a value
 * read out of a set but a choice between visible arrangements, so every
 * answer stands on the row at once, the pressed one says which, and switching
 * costs one press and no popup. That is the whole argument for it, and it is
 * why the shape never belonged in the sort: a select would have made the
 * arrangement the fourth thing to open a menu to discover.
 *
 * The shapes are drawn rather than named, because they are silhouettes of
 * the same list and the icon is what tells them apart at a glance; each carries
 * its name for anyone who cannot see it, and the row is labelled as the one
 * thing it decides — the layout.
 *
 * Unlike the scope and the order, this stands down for nothing: a search answers
 * in sections, and the sections are read in the shape the reader chose, so the
 * switch keeps its answer while a query is live.
 *
 * It wears the app's one segmented look (`segmented`), the same one the header's
 * destinations wear, and it wears it as a track rather than as outline
 * buttons: a toggle group's own selected shade is `bg-muted`, which is also the
 * shade an unselected segment darkens *to* on hover, so on its own this switch could
 * not tell the reader which segment was chosen. The raised segment — surface colour
 * under one quiet shadow, out of a muted bed — can, and it is the same signal the
 * header's marked destination gives. So the segments drop `variant="outline"`: a
 * border belongs to a button that stands alone, and these never do. The halves
 * are square and compact — a 24px pill in a 28px control, one step under the
 * field they stand beside — because a shape switch is the row's quietest control:
 * it says which arrangement the list is in and nothing else.
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
        // toggled off, so the row never leaves the list with neither answer.
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
          //
          // `size="sm"` is the library's closest fit and is then tightened one
          // step further: a square half is the compact pill the recipe asks for,
          // and `px-1` keeps the padding from setting the width — at `size="sm"`'s
          // own `px-2.5` a 12px glyph would carry 20px of air and the three
          // halves would stop reading as one control. The glyph states its own
          // size so the library's `[&_svg:not([class*='size-'])]:size-3.5` steps
          // aside, exactly as the nav's mark does.
          className={cn(segmentedItemVariants({ active: "toggle" }), "h-6 min-w-6 px-1")}
        >
          {value === "skill" ? (
            <Rows3 className="size-3" aria-hidden />
          ) : value === "grid" ? (
            <LayoutGrid className="size-3" aria-hidden />
          ) : (
            <Layers className="size-3" aria-hidden />
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}