import { describe, expect, it } from "vitest";

import {
  isAppLocale,
  readLanguagePreference,
  resolveLocale,
  skillDescription,
  systemLocale,
  LANGUAGE_STORAGE_KEY,
} from "./i18n-content";
import { storage } from "./storage";

describe("isAppLocale", () => {
  it("accepts only the shipped locales", () => {
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("zh")).toBe(true);
    expect(isAppLocale("system")).toBe(false);
    expect(isAppLocale("zh-CN")).toBe(false);
    expect(isAppLocale(undefined)).toBe(false);
  });
});

describe("readLanguagePreference", () => {
  it("defaults to system when nothing is stored", () => {
    storage.removeItem(LANGUAGE_STORAGE_KEY);
    expect(readLanguagePreference()).toBe("system");
  });

  it("reads an explicit locale choice", () => {
    storage.setItem(LANGUAGE_STORAGE_KEY, "zh");
    expect(readLanguagePreference()).toBe("zh");
  });

  it("falls back to system for an unrecognized stored value", () => {
    storage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(readLanguagePreference()).toBe("system");
  });
});

describe("systemLocale", () => {
  it("maps every Chinese variant to zh", () => {
    expect(systemLocale("zh")).toBe("zh");
    expect(systemLocale("zh-CN")).toBe("zh");
    expect(systemLocale("zh-Hans")).toBe("zh");
    expect(systemLocale("zh-Hant-TW")).toBe("zh");
    expect(systemLocale("ZH-cn")).toBe("zh");
  });

  it("maps every other language to en", () => {
    expect(systemLocale("en")).toBe("en");
    expect(systemLocale("en-US")).toBe("en");
    expect(systemLocale("fr")).toBe("en");
    expect(systemLocale("ja-JP")).toBe("en");
  });
});

describe("resolveLocale", () => {
  it("passes an explicit locale through", () => {
    expect(resolveLocale("en", "zh-CN")).toBe("en");
    expect(resolveLocale("zh", "en-US")).toBe("zh");
  });

  it("resolves system through the platform language", () => {
    expect(resolveLocale("system", "zh-CN")).toBe("zh");
    expect(resolveLocale("system", "en-US")).toBe("en");
  });
});

describe("skillDescription", () => {
  const item = {
    description: "Work with PDFs.",
    descriptionZh: "处理 PDF。",
  };

  it("returns the English description in English mode", () => {
    expect(skillDescription(item, "en")).toBe("Work with PDFs.");
  });

  it("prefers the Chinese description in Chinese mode", () => {
    expect(skillDescription(item, "zh")).toBe("处理 PDF。");
  });

  it("falls back to English when the Chinese description is missing", () => {
    expect(
      skillDescription({ description: "Work with PDFs." }, "zh"),
    ).toBe("Work with PDFs.");
  });

  it("falls back to English when the Chinese description is blank", () => {
    expect(
      skillDescription(
        { description: "Work with PDFs.", descriptionZh: "   " },
        "zh",
      ),
    ).toBe("Work with PDFs.");
  });
});
