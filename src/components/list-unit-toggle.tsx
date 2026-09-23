import { Boxes, List } from "lucide-react";

import { cn } from "../lib/utils";
import type { ListUnit } from "../lib/list-view";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/**
 * The unit switch shared by the two lists that offer both readings — the store's
 * browse list and the installed list. A segmented control, not a menu: there are
 * exactly two units and both are worth naming, so the current one stays legible
 * at a glance instead of hiding behind a trigger.
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
  return (
    <ToggleGroup
      className={cn("shrink-0", className)}
      variant="outline"
      size="lg"
      spacing={0}
      value={[unit]}
      onValueChange={(value) => {
        const next = value[0];
        if (next && next !== unit) onChange(next as ListUnit);
      }}
      aria-label="列表单位"
    >
      <ToggleGroupItem value="repo" className="gap-1.5 px-3">
        <Boxes aria-hidden />
        <span>按仓库</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="skill" className="gap-1.5 px-3">
        <List aria-hidden />
        <span>按技能</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
