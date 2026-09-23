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
 * Base UI toggles the active item off when it is clicked again, which would
 * leave no theme selected — the guard keeps the control radio-like.
 */
export function ThemeModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      size="sm"
      value={theme ? [theme] : []}
      onValueChange={(value) => {
        const next = value[0];
        if (next) setTheme(next);
      }}
      aria-label="外观"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} className="gap-1 px-2">
          <Icon />
          <span>{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
