import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "./theme-provider";
import { ThemeModeToggle } from "./theme-mode-toggle";

/**
 * jsdom ships no localStorage here (Node's own is disabled without
 * `--localstorage-file`), and next-themes swallows the resulting errors — so
 * persistence is only observable behind a stub.
 */
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  });
  return store;
}

/**
 * next-themes resolves `system` through `prefers-color-scheme`, and jsdom's
 * matchMedia stub always reports `matches: false` — so the initial state here
 * is light. Assertions target explicit choices, never the system branch.
 */
function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeModeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeModeToggle", () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = stubLocalStorage();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("offers light, dark and system", () => {
    renderToggle();

    expect(screen.getByText("浅色")).toBeInTheDocument();
    expect(screen.getByText("深色")).toBeInTheDocument();
    expect(screen.getByText("跟随系统")).toBeInTheDocument();
  });

  it("turns the document dark and persists the choice", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByText("深色"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    // enableColorScheme drives native scrollbars / form controls.
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(stored.get("skill-one-theme")).toBe("dark");
  });

  it("returns to light when picked again", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByText("深色"));
    await user.click(screen.getByText("浅色"));

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(stored.get("skill-one-theme")).toBe("light");
  });

  it("keeps the current theme when the active option is clicked again", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByText("深色"));
    await user.click(screen.getByText("深色"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(stored.get("skill-one-theme")).toBe("dark");
  });

  it("restores a previously stored dark theme on mount", () => {
    stored.set("skill-one-theme", "dark");

    renderToggle();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
