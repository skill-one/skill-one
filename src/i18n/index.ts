import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  readLanguagePreference,
  resolveLocale,
  type AppLocale,
} from "../lib/i18n-content";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

/**
 * The app's single i18next instance, shared by every React entry (main
 * window and tray popover). Resources are bundled JSON — nothing is fetched
 * at runtime — so init is synchronous and the first paint already speaks the
 * right language. `LanguageProvider` afterwards tracks preference and
 * platform-language changes and calls `changeLanguage` on this instance.
 */
const initialLocale: AppLocale = resolveLocale(readLanguagePreference());

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: initialLocale,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Accessibility: the document language before the first provider effect runs.
document.documentElement.lang = initialLocale === "zh" ? "zh-CN" : "en";

export default i18n;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof en;
    };
  }
}
