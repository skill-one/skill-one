import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { Boxes, Rows3, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";
import type { ListUnit } from "../lib/list-view";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** The two readings: a mark each, and the i18n key a hover says for it. */
const UNITS: { unit: ListUnit; labelKey: ParseKeys; icon: LucideIcon }[] = [
  { unit: "repo", labelKey: "unit.byRepo", icon: Boxes },
  { unit: "skill", labelKey: "unit.bySkill", icon: Rows3 },
];

/**
 * The unit switch shared by the two lists that offer both readings — the store's
 * browse list and the installed list. A segmented control, not a menu: there are
 * exactly two units and both are marked on it, so the current one stays legible
 * at a glance instead of hiding behind a trigger.
 *
 * The marks do the talking: one crate per repository, one row per skill — the
 * same subject in two shapes, so what changes on screen is what changes on the
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
      className={cn("shrink-0", className)}
      variant="outline"
      spacing={0}
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
                className="px-2.5"
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
