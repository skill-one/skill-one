import { useLanguageContext } from "./language-provider";
import type { AppLocale } from "../lib/i18n-content";

/** The language preference, the resolved locale, and the setter. */
export function useLanguagePreference() {
  return useLanguageContext();
}

/** The resolved locale the UI renders in. */
export function useAppLocale(): AppLocale {
  return useLanguageContext().locale;
}
