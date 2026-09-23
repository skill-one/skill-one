import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "./theme-provider";
import { SettingsMenuItem } from "./settings-popover";
import { TooltipProvider } from "./ui/tooltip";
import { SidebarMenu } from "./ui/sidebar";
import {
  DEFAULT_REPO_CARD_LIMIT,
  getRepoCardLimit,
  setRepoCardLimit,
} from "../lib/repo-card-preview";
import { getUpdateStatus, resetUpdateState } from "../lib/update-store";
import { resetUpdateChannel } from "../lib/update-channel";

/**
 * The 软件更新 row runs against the real update store, so the desktop toggle
 * (off by default, matching jsdom) and the install channel are driven from here.
 */
const updateEnv = vi.hoisted(() => ({
  isTauri: false,
  managed: false,
  release: null as { version: string; body?: string } | null,
}));

vi.mock("../lib/tauri", () => ({ isTauri: () => updateEnv.isTauri }));
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: async () => updateEnv.release,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async () => updateEnv.managed,
}));
// Desktop mode also reaches the native window API (theme sync); jsdom is not
// Tauri, so the bridge is stubbed rather than exercised.
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme: async () => {} }),
}));

/** Snapshot the mocked registry hook reports; per-test overrides apply next. */
const stats = vi.hoisted(() => ({
  current: null as import("../lib/registry/protocol").IndexInfo | null,
}));

vi.mock("../hooks/use-registry-snapshot", () => ({
  useRegistrySnapshot: (selector: (snapshot: {
    index: import("../lib/registry/protocol").IndexInfo | null;
  }) => unknown) =>
    selector({
      index: stats.current,
    }),
}));

function renderSettings() {
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <SidebarMenu>
          <SettingsMenuItem />
        </SidebarMenu>
      </TooltipProvider>
    </ThemeProvider>,
  );
}

/** Open the popover from its sidebar row. */
async function openPopover(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "设置" }));
  await screen.findByText("外观");
}

describe("SettingsMenuItem", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    stats.current = null;
    updateEnv.isTauri = false;
    updateEnv.managed = false;
    updateEnv.release = null;
    // Store state (and the memoised channel) outlives a render.
    resetUpdateState();
    resetUpdateChannel();
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    // The reset notifies subscribers, and this hook runs before React
    // Testing Library's own cleanup — hence the act() wrapper.
    act(() => setRepoCardLimit(DEFAULT_REPO_CARD_LIMIT));
  });

  it("opens a popover with the quick settings from the sidebar row", async () => {
    const user = userEvent.setup();
    renderSettings();

    await openPopover(user);

    expect(screen.getByText("外观")).toBeInTheDocument();
    expect(screen.getByText("跟随系统")).toBeInTheDocument();
    expect(screen.getByText("仓库卡片预览数")).toBeInTheDocument();
    expect(screen.getByText("软件更新")).toBeInTheDocument();
    expect(screen.getByText("高级设置")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Skill One v${__APP_VERSION__}`)),
    ).toBeInTheDocument();
  });

  it("switches the document to dark from the popover", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openPopover(user);

    await user.click(screen.getByText("深色"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("lets the reader size the repository card preview", async () => {
    const user = userEvent.setup();
    setRepoCardLimit(DEFAULT_REPO_CARD_LIMIT);
    renderSettings();
    await openPopover(user);

    await user.click(screen.getByRole("button", { name: "7" }));

    expect(getRepoCardLimit()).toBe(7);
  });

  it("reports browser mode when checking updates outside Tauri", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openPopover(user);

    await user.click(screen.getByRole("button", { name: /软件更新/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "自动更新仅在桌面应用内可用。",
    );
  });

  it("settles on 已是最新 after a check finds nothing", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    renderSettings();
    await openPopover(user);

    await user.click(screen.getByRole("button", { name: /软件更新/ }));

    expect(await screen.findByText("已是最新")).toBeInTheDocument();
  });

  it("hands a Homebrew-managed install back to brew", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    updateEnv.managed = true;
    renderSettings();
    await openPopover(user);

    await user.click(screen.getByRole("button", { name: /软件更新/ }));

    expect(
      await screen.findByText(/brew upgrade --cask skill-one/),
    ).toBeInTheDocument();
    // The row stops pretending a check could help.
    expect(screen.getByRole("button", { name: /软件更新/ })).toBeDisabled();
  });

  it("announces a new version on the row and hands off to the confirmation dialog", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    updateEnv.release = { version: "9.9.9", body: "notes" };
    renderSettings();
    await openPopover(user);

    await user.click(screen.getByRole("button", { name: /软件更新/ }));

    // Both the sidebar chip and the popover row flag the discovery: the chip
    // is a button, the row's status is a plain badge span.
    expect(
      await screen.findByRole("button", { name: "有新版本" }),
    ).toBeInTheDocument();
    expect(screen.getByText("有新版本", { selector: "span" })).toBeInTheDocument();
    // The second click on an available update opens the dialog instead of
    // re-checking, and dismisses the flyout so only one overlay is up.
    await user.click(screen.getByRole("button", { name: /软件更新/ }));
    expect(getUpdateStatus().dialogOpen).toBe(true);
    // The flyout steps aside so only the confirmation dialog is up.
    expect(screen.queryByText("外观")).not.toBeInTheDocument();
  });

  it("opens the advanced settings dialog from the 高级设置 row", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openPopover(user);

    await user.click(screen.getByRole("button", { name: /高级设置/ }));

    expect(await screen.findByText("CDN 基址")).toBeInTheDocument();
    expect(screen.getByText("数据源")).toBeInTheDocument();
    // The flyout steps aside: one overlay at a time.
    expect(screen.queryByText("外观")).not.toBeInTheDocument();
  });
});
