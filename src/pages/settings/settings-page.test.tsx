import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../../components/theme-provider";
import { SettingsPage } from "./settings-page";
import type { IndexInfo } from "../../lib/registry/protocol";
import { setIndexTag, setProfilesTag } from "../../lib/cdn-config";
import { getUpdateStatus, resetUpdateState } from "../../lib/update-store";
import { resetUpdateChannel } from "../../lib/update-channel";

/**
 * The 软件更新 card runs against the real update store, so the desktop toggle
 * (off by default, matching jsdom) and the install channel are driven from here.
 */
const updateEnv = vi.hoisted(() => ({
  isTauri: false,
  managed: false,
  release: null as { version: string; body?: string } | null,
}));

vi.mock("../../lib/tauri", () => ({ isTauri: () => updateEnv.isTauri }));
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
  current: null as IndexInfo | null,
}));

vi.mock("../../hooks/use-registry-snapshot", () => ({
  useRegistrySnapshot: (selector: (snapshot: {
    index: IndexInfo | null;
  }) => unknown) =>
    selector({
      index: stats.current,
    }),
}));

/** The manual freshness check the 数据源 card drives. */
const refresh = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("../../lib/registry/refresh", () => ({
  checkForRegistryUpdate: refresh.check,
}));

/** When the freshness probe behind `SERVED` last completed. */
const CHECKED_AT_ISO = "2026-09-11T08:00:00Z";

const SERVED: IndexInfo = {
  tag: "dist-2026-09-06",
  generatedAt: "2026-01-01T00:00:00Z",
  total: 23734,
  profilesTag: "dist-2026-09-10-2",
  profilesAt: "2026-09-10T07:22:00Z",
  origin: "unchanged",
  checkedAt: Date.parse(CHECKED_AT_ISO),
};

/** How the card renders a snapshot stamp in the host's local time zone. */
const localeStamp = (iso: string) => new Date(iso).toLocaleString();
const GENERATED_AT_LOCALE = localeStamp("2026-01-01T00:00:00Z");
const PROFILES_AT_LOCALE = localeStamp("2026-09-10T07:22:00Z");
const CHECKED_AT_LOCALE = localeStamp(CHECKED_AT_ISO);

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
    setIndexTag("");
    setProfilesTag("");
  });

  it("hosts the appearance picker alongside the CDN settings", () => {
    renderSettings();

    expect(screen.getByText("外观")).toBeInTheDocument();
    expect(screen.getByText("CDN 基址")).toBeInTheDocument();
    expect(screen.getByText("跟随系统")).toBeInTheDocument();
  });

  it("names the served snapshots of both sources and that they were reused, not downloaded", () => {
    stats.current = SERVED;
    renderSettings();

    expect(screen.getByText("数据源")).toBeInTheDocument();
    // The tags name the snapshot days; displayed whole.
    expect(screen.getByText("dist-2026-09-06")).toBeInTheDocument();
    expect(screen.getByText("dist-2026-09-10-2")).toBeInTheDocument();
    expect(screen.getByText("23,734")).toBeInTheDocument();
    expect(screen.getByText(GENERATED_AT_LOCALE)).toBeInTheDocument();
    expect(screen.getByText(PROFILES_AT_LOCALE)).toBeInTheDocument();
    // The last completed check is dated too — it covers both sources.
    expect(screen.getByText(CHECKED_AT_LOCALE)).toBeInTheDocument();
    expect(
      screen.getByText("索引未更新，已复用本地缓存"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "立即重新下载" }),
    ).toBeInTheDocument();
  });

  it("holds placeholders until a snapshot is being served", () => {
    renderSettings();

    // Two snapshot tags + two stamps + the index row count + last check.
    expect(screen.getAllByText("未知")).toHaveLength(6);
    expect(screen.getByText("数据尚未就绪")).toBeInTheDocument();
  });

  it("shows the recorded snapshot tags when the live identity has not arrived", () => {
    // The registry client persists the served tags; a fresh session reads
    // them back before the first index event lands.
    setIndexTag("dist-2026-09-06");
    setProfilesTag("dist-2026-09-10-2");
    renderSettings();

    expect(screen.getByText("dist-2026-09-06")).toBeInTheDocument();
    expect(screen.getByText("dist-2026-09-10-2")).toBeInTheDocument();
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

  it("announces a new version and opens the confirmation dialog", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    updateEnv.release = { version: "9.9.9", body: "notes" };
    renderSettings();

    await user.click(screen.getByRole("button", { name: "检查更新" }));

    expect(await screen.findByText("有新版本 v9.9.9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "立即更新" }));
    // The card hands off to the store: UpdateDialog reacts to exactly this.
    expect(getUpdateStatus().dialogOpen).toBe(true);
  });

  it("settles on 已是最新版本 after a check finds nothing", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    renderSettings();

    await user.click(screen.getByRole("button", { name: "检查更新" }));

    expect(await screen.findByText("已是最新版本。")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "立即更新" }),
    ).not.toBeInTheDocument();
  });

  it("hands a Homebrew-managed install back to brew", async () => {
    const user = userEvent.setup();
    updateEnv.isTauri = true;
    updateEnv.managed = true;
    renderSettings();

    await user.click(screen.getByRole("button", { name: "检查更新" }));

    expect(
      await screen.findByText(/brew upgrade --cask skill-one/),
    ).toBeInTheDocument();
    // The button stays put but stops pretending a check could help.
    expect(screen.getByRole("button", { name: "检查更新" })).toBeDisabled();
  });

  it("switches the document to dark from the settings page", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByText("深色"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it.each([
    ["current", "已是最新快照"],
    ["updated", "发现新快照，已在后台更新"],
    ["unknown", "检测失败，请稍后重试"],
  ] as const)("reports a %s manual check", async (status, label) => {
    const user = userEvent.setup();
    refresh.check.mockResolvedValue({ status });
    renderSettings();

    await user.click(screen.getByRole("button", { name: "检测更新" }));

    expect(await screen.findByText(label)).toBeInTheDocument();
    // Asking explicitly must ignore the freshness window.
    expect(refresh.check).toHaveBeenCalledWith({ force: true });
  });
});
