import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const OPTIONS = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: Monitor },
] as const;

/**
 * Three-way appearance picker. `system` resolves via `prefers-color-scheme`
 * and keeps reacting to OS appearance changes.
 *
 * Radix deselects a `type="single"` item when it is clicked again, which would
 * leave no theme selected — the guard keeps the control radio-like.
 */
export function ThemeModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={theme}
      onValueChange={(value) => {
        if (value) setTheme(value);
      }}
      aria-label="外观"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} className="gap-1.5 px-3">
          <Icon />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
