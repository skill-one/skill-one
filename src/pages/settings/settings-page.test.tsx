import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../components/theme-provider";
import { SettingsPage } from "./settings-page";
import type { IndexInfo } from "../../lib/registry/protocol";

/** Snapshot the mocked registry hook reports; per-test overrides apply next. */
const stats = vi.hoisted(() => ({
  current: null as IndexInfo | null,
}));

vi.mock("../../hooks/use-registry-stats", () => ({
  useRegistryStats: () => ({
    count: 0,
    complete: true,
    indexing: false,
    ready: true,
    epoch: 0,
    error: null,
    index: stats.current,
    refetch: () => {},
  }),
}));

const SERVED: IndexInfo = {
  commit: "e52627feff2681df05ad537627f651a2121a7013",
  generatedAt: "2026-01-01T00:00:00Z",
  total: 23734,
  formatVersion: 4,
  origin: "unchanged",
};

/** How the card renders `SERVED.generatedAt` in the host's local time zone. */
const GENERATED_AT_LOCALE = new Date(
  "2026-01-01T00:00:00Z",
).toLocaleString();

function renderSettings() {
  return render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    stats.current = null;
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("hosts the appearance picker alongside the CDN settings", () => {
    renderSettings();

    expect(screen.getByText("外观")).toBeInTheDocument();
    expect(screen.getByText("CDN 基址")).toBeInTheDocument();
    expect(screen.getByText("跟随系统")).toBeInTheDocument();
  });

  it("names the served index snapshot and that it was reused, not downloaded", () => {
    stats.current = SERVED;
    renderSettings();

    expect(screen.getByText("技能索引")).toBeInTheDocument();
    // A prefix is enough to recognize a commit; the full sha would only wrap.
    expect(screen.getByText("e52627feff26")).toBeInTheDocument();
    expect(screen.getByText("23,734")).toBeInTheDocument();
    expect(screen.getByText(GENERATED_AT_LOCALE)).toBeInTheDocument();
    expect(
      screen.getByText("索引未更新，已复用本地缓存"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "立即重新下载" }),
    ).toBeInTheDocument();
  });

  it("holds placeholders until a snapshot is being served", () => {
    renderSettings();

    expect(screen.getAllByText("未知")).toHaveLength(3);
    expect(screen.getByText("索引尚未就绪")).toBeInTheDocument();
  });

  it("shows the 软件更新 card with a manual check control", () => {
    renderSettings();

    expect(screen.getByText("软件更新")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "检查更新" }),
    ).toBeInTheDocument();
  });

  it("reports browser mode when checking updates outside Tauri", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "检查更新" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "自动更新仅在桌面应用内可用。",
    );
  });

  it("switches the document to dark from the settings page", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByText("深色"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
