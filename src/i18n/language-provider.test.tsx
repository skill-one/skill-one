import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "./index";
import { I18nProvider } from "./language-provider";
import { LanguageToggle } from "../components/language-toggle";
import { LANGUAGE_STORAGE_KEY } from "../lib/i18n-content";

/** The global setup pins the preference to zh; the provider tests start from
 *  the real default (no stored choice). */
beforeEach(() => {
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

/** Render the three-way toggle inside its own provider (test-utils' wrapper
 *  would mount a second provider around it). */
function renderToggle() {
  return render(
    <I18nProvider>
      <LanguageToggle />
    </I18nProvider>,
  );
}

/** Make navigator.language answer a different tag until the spy restores it. */
function mockPlatformLanguage(tag: string) {
  return vi
    .spyOn(Navigator.prototype, "language", "get")
    .mockReturnValue(tag);
}

describe("I18nProvider + LanguageToggle", () => {
  it("defaults to following the system language", () => {
    // jsdom's navigator.language is en-US.
    renderToggle();

    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(i18n.language).toBe("en");
  });

  it("switches to Chinese immediately and persists the choice", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByRole("group", { name: "语言" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(i18n.language).toBe("zh");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh");
  });

  it("restores a persisted explicit choice on mount", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");

    renderToggle();

    expect(screen.getByRole("group", { name: "语言" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("re-resolves the locale when the system language changes", () => {
    renderToggle();
    expect(document.documentElement.lang).toBe("en");

    let language = mockPlatformLanguage("zh-CN");
    fireEvent(window, new Event("languagechange"));
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(i18n.language).toBe("zh");

    language.mockRestore();
    language = mockPlatformLanguage("en-US");
    fireEvent(window, new Event("languagechange"));
    expect(document.documentElement.lang).toBe("en");
    language.mockRestore();
  });

  it("does not react to system language changes with an explicit choice", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("button", { name: "中文" }));
    const language = mockPlatformLanguage("en-US");
    fireEvent(window, new Event("languagechange"));

    expect(document.documentElement.lang).toBe("zh-CN");
    language.mockRestore();
  });
});
