import { ChevronDown, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** One choice of a `FilterDropdown`, led by its own glyph. */
export interface FilterOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  /**
   * Marks the option that means "no filter applied": while it is selected the
   * trigger shows `label` instead of this option's own text, so the control
   * reads as inactive rather than as a choice of that option.
   */
  neutral?: boolean;
}

/**
 * A single-select toolbar filter rendered as a pill dropdown, shared by the
 * store and my-skills toolbars. The trigger leads with the active option's
 * own glyph, so the closed and open states of one value agree.
 */
export function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** The trigger's text while the neutral option (if any) is selected. */
  label?: string;
  value: T;
  options: Array<FilterOption<T>>;
  onChange: (next: T) => void;
}) {
  // The selected option, so the trigger can lead with the same glyph its menu
  // row shows (keeping the closed and open states of one value in agreement).
  const current =
    options.find((option) => option.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-full px-4">
          <span className="flex items-center gap-1.5">
            <current.icon
              aria-hidden="true"
              className="h-4 w-4 text-foreground"
            />
            {current.neutral ? label : current.label}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as T)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon
                aria-hidden="true"
                className={cn(
                  "h-4 w-4",
                  option.value === value
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
