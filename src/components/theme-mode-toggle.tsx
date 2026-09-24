import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const OPTIONS = [
  { value: "light", labelKey: "theme.light", icon: Sun },
  { value: "dark", labelKey: "theme.dark", icon: Moon },
  { value: "system", labelKey: "theme.system", icon: Monitor },
] as const;

/**
 * Three-way appearance picker. `system` resolves via `prefers-color-scheme`
 * and keeps reacting to OS appearance changes.
 *
 * Base UI toggles the active item off when it is clicked again, which would
 * leave no theme selected — the guard keeps the control radio-like.
 */
export function ThemeModeToggle() {
  const { t } = useTranslation();
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
      aria-label={t("settings.appearance")}
    >
      {OPTIONS.map(({ value, labelKey, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} className="gap-1 px-2">
          <Icon />
          <span>{t(labelKey)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
