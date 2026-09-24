import { storage } from "./storage";

/**
 * Content localization helpers shared by UI data. Kept free of i18next so
 * the registry worker can import the same types (it reads no UI strings).
 */

/** A language the app ships resources for. */
export type AppLocale = "en" | "zh";

/**
 * The user's language choice. `system` is not a locale — it resolves through
 * the platform language, the same three-state model the theme uses.
 */
export type LanguagePreference = AppLocale | "system";

/** localStorage key for the language preference, shared by both entries. */
export const LANGUAGE_STORAGE_KEY = "skill-one-language";

/** Whether a value is one of the locales the app actually ships. */
export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "zh";
}

/**
 * Read the persisted language preference. A missing or unreadable value (a
 * blocked store, a value from an older build) defaults to `system`.
 */
export function readLanguagePreference(): LanguagePreference {
  const stored = storage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "system") return "system";
  return isAppLocale(stored) ? stored : "system";
}

/**
 * Resolve a platform language tag to a supported locale. Every Chinese
 * variant (`zh`, `zh-CN`, `zh-Hans`, …) reads as Chinese; anything else
 * reads as English, the source language of the upstream data.
 */
export function systemLocale(
  navLanguage: string = typeof navigator === "undefined" ? "en" : navigator.language,
): AppLocale {
  return navLanguage.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** Resolve a preference to a concrete locale for the given platform tag. */
export function resolveLocale(
  preference: LanguagePreference,
  navLanguage?: string,
): AppLocale {
  return preference === "system" ? systemLocale(navLanguage) : preference;
}

/** Anything carrying the English and (optionally) Chinese description. */
export interface Described {
  description: string;
  descriptionZh?: string;
}

/**
 * Pick the description for a locale. In Chinese mode a non-empty translated
 * description wins; a missing or blank one falls back to English rather than
 * showing an empty slot.
 */
export function skillDescription(
  item: Described,
  locale: AppLocale,
): string {
  if (locale === "zh" && item.descriptionZh && item.descriptionZh.trim()) {
    return item.descriptionZh;
  }
  return item.description;
}
