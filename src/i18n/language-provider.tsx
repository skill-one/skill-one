import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { storage } from "../lib/storage";
import {
  LANGUAGE_STORAGE_KEY,
  readLanguagePreference,
  resolveLocale,
  type AppLocale,
  type LanguagePreference,
} from "../lib/i18n-content";
import i18n from "./index";

/**
 * Holds the language *preference* (system | en | zh), mirroring the theme's
 * three-state model, and derives the resolved locale. Both window entries
 * mount their own provider but share the localStorage origin, so the choice
 * stays in sync.
 */
interface LanguageContextValue {
  /** The stored choice. */
  preference: LanguagePreference;
  /** The resolved locale the UI renders in. */
  locale: AppLocale;
  /** Persist and apply a new preference. */
  setPreference: (preference: LanguagePreference) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(() =>
    readLanguagePreference(),
  );
  // The platform tag is state so a system-wide language change re-resolves
  // the locale while `system` is selected.
  const [platformLanguage, setPlatformLanguage] = useState<string>(
    () => navigator.language,
  );

  useEffect(() => {
    if (preference !== "system") return;
    const onLanguageChange = () => setPlatformLanguage(navigator.language);
    window.addEventListener("languagechange", onLanguageChange);
    return () => window.removeEventListener("languagechange", onLanguageChange);
  }, [preference]);

  const locale = useMemo(
    () => resolveLocale(preference, platformLanguage),
    [preference, platformLanguage],
  );

  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setPreference = useCallback((next: LanguagePreference) => {
    storage.setItem(LANGUAGE_STORAGE_KEY, next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, locale, setPreference }),
    [preference, locale, setPreference],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Context accessor shared by the hooks module. */
export function useLanguageContext(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguagePreference must be used within I18nProvider");
  }
  return context;
}
