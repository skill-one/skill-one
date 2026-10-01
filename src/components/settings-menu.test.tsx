import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "./theme-provider";
import { I18nProvider } from "../i18n/language-provider";
import { SettingsMenu } from "./settings-menu";
import { TooltipProvider } from "./ui/tooltip";
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
  useRegistrySnapshot: (
    selector: (snapshot: {
      index: import("../lib/registry/protocol").IndexInfo | null;
    }) => unknown,
  ) =>
    selector({
      index: stats.current,
    }),
}));

function renderSettings() {
  // The activity dialog reads the log through react-query.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <I18nProvider>
          <TooltipProvider>
            <SettingsMenu />
          </TooltipProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** Open the menu from the header's settings entry. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "设置" }));
  await screen.findByText("软件更新");
}

/**
 * Open a cascading submenu. The trigger unfolds on hover, the way native
 * menus do. The option is picked with `fireEvent.click` rather than
 * `user.click`: jsdom has no layout, so Base UI reads every pointer position
 * as (0, 0) and treats the move onto the submenu as leaving it — the exit
 * transition then marks the row `pointer-events: none` before the click
 * lands. The hover that opens the submenu is unaffected; only the move
 * between the two popups is.
 */
async function openSubmenu(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  firstOption: string,
) {
  const trigger = screen.getByText(label);
  await user.hover(trigger);
  const option = await screen.findByRole("menuitemradio", {
    name: firstOption,
  });
  return option;
}

describe("SettingsMenu", () => {
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
  });

  it("opens a cascading menu with one row per setting from the header entry", async () => {
    const user = userEvent.setup();
    renderSettings();

    await openMenu(user);

    for (const row of [
      "语言",
      "主题",
      "软件更新",
      "高级设置",
      "活动日志",
      "开发者",
    ]) {
      expect(screen.getByText(row)).toBeInTheDocument();
    }
    // Display choices (graph layout, card preview size) live in Advanced
    // Settings now, not in this menu.
    expect(screen.queryByText("仓库卡片预览数")).toBeNull();
    // The idle update row carries the version on its trailing edge; there is
    // no footer of its own.
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
  });

  it("switches the document to dark from the 主题 submenu", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openMenu(user);

    await openSubmenu(user, "主题", "浅色");
    expect(screen.getByRole("menuitemradio", { name: "深色" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "深色" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("switches the interface language from the 语言 submenu", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openMenu(user);

    await openSubmenu(user, "语言", "系统默认");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(document.documentElement.lang).toBe("en");
  });

  it("reports browser mode when checking updates outside Tauri", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: /软件更新/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Automatic updates are only available in the desktop app.",
    );
  });

  it("settles on 已是最新 after a check finds nothing", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    renderSettings();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: /软件更新/ }));

    expect(await screen.findByText("已是最新")).toBeInTheDocument();
  });

  it("hands a Homebrew-managed install back to brew", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    updateEnv.managed = true;
    renderSettings();
    await openMenu(user);

    // The check is what discovers the managed install; the row is enabled
    // while the phase is still idle.
    await user.click(screen.getByRole("menuitem", { name: /软件更新/ }));

    // The status settles before the row's command text is worth asserting.
    expect(await screen.findByText("Homebrew 管理")).toBeInTheDocument();
    expect(screen.getByText(/brew upgrade --cask skill-one/)).toBeInTheDocument();
    // The row stops pretending a check could help. Base UI marks a disabled
    // menu item with aria-disabled rather than the disabled property, which
    // is what `toBeDisabled` reads.
    expect(screen.getByRole("menuitem", { name: /软件更新/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("announces a new version on the row and hands off to the confirmation dialog", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    updateEnv.release = { version: "9.9.9", body: "notes" };
    renderSettings();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: /软件更新/ }));

    // Both the header chip and the menu row flag the discovery: the chip is a
    // button, the row's status is a plain badge span.
    expect(
      await screen.findByRole("button", { name: "有新版本" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("有新版本", { selector: "span" }),
    ).toBeInTheDocument();
    // The second click on an available update opens the dialog instead of
    // re-checking, and dismisses the menu so only one overlay is up.
    await user.click(screen.getByRole("menuitem", { name: /软件更新/ }));
    expect(getUpdateStatus().dialogOpen).toBe(true);
    // The menu steps aside so only the confirmation dialog is up.
    expect(screen.queryByText("软件更新")).not.toBeInTheDocument();
  });

  it("opens the advanced settings dialog from the 高级设置 row", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: /高级设置/ }));

    expect(await screen.findByText("CDN 基址")).toBeInTheDocument();
    expect(screen.getByText("数据源")).toBeInTheDocument();
    // The menu steps aside: one overlay at a time.
    expect(screen.queryByText("软件更新")).not.toBeInTheDocument();
  });

  it("opens the activity dialog from the 活动日志 row", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: /活动日志/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // One overlay at a time here too.
    expect(screen.queryByText("软件更新")).not.toBeInTheDocument();
  });

  it("opens the developer dialog from the 开发者 row", async () => {
    const user = userEvent.setup();
    renderSettings();
    await openMenu(user);

    await user.click(screen.getByRole("menuitem", { name: /开发者/ }));

    // The dialog reads the (empty, browser-mode) ledger and says so.
    expect(
      await screen.findByText("账本为空——安装技能后，其来源将记录在这里"),
    ).toBeInTheDocument();
    // One overlay at a time here too.
    expect(screen.queryByText("软件更新")).not.toBeInTheDocument();
  });
});
