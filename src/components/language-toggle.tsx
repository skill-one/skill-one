import { useTranslation } from "react-i18next";

import { useLanguagePreference } from "../i18n/use-language";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/**
 * Three-way language picker: English, Chinese, or system. Text labels
 * rather than flags — a flag stands for a country, not a language — the same
 * radio-like control the theme toggle uses.
 */
const OPTIONS = [
  { value: "en", labelKey: "language.en" },
  { value: "zh", labelKey: "language.zh" },
  { value: "system", labelKey: "language.system" },
] as const;

export function LanguageToggle() {
  const { t } = useTranslation();
  const { preference, setPreference } = useLanguagePreference();

  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      size="sm"
      value={[preference]}
      onValueChange={(value) => {
        const next = value[0];
        if (next === "en" || next === "zh" || next === "system") {
          setPreference(next);
        }
      }}
      aria-label={t("language.label")}
    >
      {OPTIONS.map(({ value, labelKey }) => (
        <ToggleGroupItem key={value} value={value} className="px-2">
          <span>{t(labelKey)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
