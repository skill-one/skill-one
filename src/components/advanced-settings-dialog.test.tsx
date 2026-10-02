import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdvancedSettingsDialog } from "./advanced-settings-dialog";
import type { IndexInfo } from "../lib/registry/protocol";
import { DEFAULT_CDN_BASE, getCdnBase } from "../lib/cdn-config";

/** Snapshot the mocked registry hook reports; per-test overrides apply next. */
const stats = vi.hoisted(() => ({
  current: null as IndexInfo | null,
}));

vi.mock("../hooks/use-registry-snapshot", () => ({
  useRegistrySnapshot: (selector: (snapshot: {
    index: IndexInfo | null;
  }) => unknown) =>
    selector({
      index: stats.current,
    }),
}));

/** The manual freshness check the 数据源 card drives. */
const refresh = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("../lib/registry/refresh", () => ({
  checkForRegistryUpdate: refresh.check,
}));

/** A source switch tells the worker to re-fetch; asserted, never executed. */
const registry = vi.hoisted(() => ({ reload: vi.fn() }));

vi.mock("../lib/registry/client", () => ({
  reloadRegistry: registry.reload,
}));

/** When the freshness probe behind `SERVED` last completed. */
const CHECKED_AT_ISO = "2026-09-11T08:00:00Z";

const SERVED: IndexInfo = {
  etag: 'W/"6fbdf1-E7rN6kKBORnBBnTXbDWPNXYOrHU"',
  publishedAt: "Thu, 01 Jan 2026 00:00:00 GMT",
  total: 23734,
  origin: "unchanged",
  checkedAt: Date.parse(CHECKED_AT_ISO),
};

/** How the card renders a snapshot stamp in the host's local time zone. */
const localeStamp = (httpDate: string) => new Date(httpDate).toLocaleString();
const PUBLISHED_AT_LOCALE = localeStamp("Thu, 01 Jan 2026 00:00:00 GMT");
const CHECKED_AT_LOCALE = localeStamp(CHECKED_AT_ISO);

function renderDialog() {
  return render(<AdvancedSettingsDialog open onOpenChange={() => {}} />);
}

describe("AdvancedSettingsDialog", () => {
  beforeEach(() => {
    stats.current = null;
    refresh.check.mockReset();
    registry.reload.mockReset();
  });

  it("hosts the CDN settings under a dialog header", () => {
    renderDialog();

    expect(screen.getByText("高级设置")).toBeInTheDocument();
    expect(screen.getByText("CDN 基址")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "使用默认 CDN" }),
    ).toBeInTheDocument();
  });

  it("switches the download source to the default CDN and reloads", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "使用默认 CDN" }));

    expect(getCdnBase()).toBe(DEFAULT_CDN_BASE);
    expect(screen.getByText("已保存")).toBeInTheDocument();
    // A source switch invalidates the downloaded registry.
    expect(registry.reload).toHaveBeenCalledTimes(1);
  });

  it("names the served snapshot and that it was reused, not downloaded", () => {
    stats.current = SERVED;
    renderDialog();

    expect(screen.getByText("数据源")).toBeInTheDocument();
    // The etag names the snapshot; displayed whole.
    expect(
      screen.getByText('W/"6fbdf1-E7rN6kKBORnBBnTXbDWPNXYOrHU"'),
    ).toBeInTheDocument();
    expect(screen.getByText("23,734")).toBeInTheDocument();
    expect(screen.getByText(PUBLISHED_AT_LOCALE)).toBeInTheDocument();
    // The last completed check is dated too.
    expect(screen.getByText(CHECKED_AT_LOCALE)).toBeInTheDocument();
    expect(
      screen.getByText("索引未更新，已复用本地缓存"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "立即重新下载" }),
    ).toBeInTheDocument();
  });

  it("holds placeholders until a snapshot is being served", () => {
    renderDialog();

    // The snapshot etag, its stamp, the row count, and the last check.
    expect(screen.getAllByText("未知")).toHaveLength(4);
    expect(screen.getByText("数据尚未就绪")).toBeInTheDocument();
  });

  it.each([
    ["current", "已是最新快照"],
    ["updated", "发现新快照，已在后台更新"],
    ["unknown", "检测失败，请稍后重试"],
  ] as const)("reports a %s manual check", async (status, label) => {
    const user = userEvent.setup();
    refresh.check.mockResolvedValue({ status });
    renderDialog();

    await user.click(screen.getByRole("button", { name: "检测更新" }));

    expect(await screen.findByText(label)).toBeInTheDocument();
    // Asking explicitly must ignore the freshness window.
    expect(refresh.check).toHaveBeenCalledWith({ force: true });
  });
});
