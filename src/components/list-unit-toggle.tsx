import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { LayoutGrid, Rows3, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";
import type { ListUnit } from "../lib/list-view";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** The two readings: a mark each, and the i18n key a hover says for it. */
const UNITS: { unit: ListUnit; labelKey: ParseKeys; icon: LucideIcon }[] = [
  { unit: "repo", labelKey: "unit.byRepo", icon: LayoutGrid },
  { unit: "skill", labelKey: "unit.bySkill", icon: Rows3 },
];

/**
 * The unit switch shared by the two lists that offer both readings — the store's
 * browse list and the installed list. A segmented control, not a menu: there are
 * exactly two units and both are marked on it, so the current one stays legible
 * at a glance instead of hiding behind a trigger.
 *
 * The control wears the app's one segmented-control look — the muted bed with
 * the active segment raised off it — that `AppNav` wears in the header: two
 * two-way switches in the same window should answer with the same selected
 * language, or each press reads differently depending on where it lands. The
 * shadcn `ToggleGroup` still carries the semantics (an `aria-pressed` pair, not
 * links); only its stock outline dress is set aside for the shared one.
 *
 * The marks do the talking, and they name the shape the screen takes, not the
 * data behind it: rows stacked in one column are the list, repo cards laid out
 * across columns are the grid — what changes on screen is what changes on the
 * control, and the pair reads in the same visual weight at 16px or 20px. The
 * words are a hover away rather than on the row, because the row is a list's and
 * the pair is legible without them; each half keeps an accessible name, though,
 * since a mark on its own is not one.
 */
export function ListUnitToggle({
  unit,
  onChange,
  className,
}: {
  /** The unit on screen. */
  unit: ListUnit;
  /** Called with the unit the reader picked; never with the current one. */
  onChange: (unit: ListUnit) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      className={cn("shrink-0 bg-muted p-0.5", className)}
      value={[unit]}
      onValueChange={(value) => {
        const next = value[0];
        if (next && next !== unit) onChange(next as ListUnit);
      }}
      aria-label={t("common.listUnit")}
    >
      {UNITS.map(({ unit: value, labelKey, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                value={value}
                aria-label={t(labelKey)}
                className="rounded-md px-2.5 text-muted-foreground hover:bg-transparent aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
              />
            }
          >
            <Icon aria-hidden />
          </TooltipTrigger>
          {/* Below the control: the row it lives in is the window's top edge. */}
          <TooltipContent side="bottom">{t(labelKey)}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
