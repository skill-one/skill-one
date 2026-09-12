import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistryHarness } from "../test/registry-harness";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";
import { renderWithRouter } from "../test/test-utils";

// The update badge only ever shows inside Tauri, so — unlike the badge-count
// tests — this file forces the desktop environment on. The mocks are scoped to
// this module, leaving app-sidebar.test.tsx (which runs in browser mode)
// untouched.
const updateMocks = vi.hoisted(() => ({
  isTauri: true,
  check: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({ isTauri: () => updateMocks.isTauri }));
// The store probes the install channel before every check.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => false) }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: updateMocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: updateMocks.relaunch }));

vi.mock("../lib/registry/client", async () => {
  const { createRegistryHarness, createRegistryClientMock } = await import(
    "../test/registry-harness"
  );
  return createRegistryClientMock(createRegistryHarness());
});
const harness = (
  (await import("../lib/registry/client")) as unknown as {
    __harness: RegistryHarness;
  }
).__harness;

import {
  checkForUpdate,
  getUpdateStatus,
  resetUpdateState,
} from "../lib/update-store";

function renderSidebar() {
  return renderWithRouter(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
    { route: "/" },
  );
}

function fakeRelease(version = "9.9.9") {
  return {
    version,
    body: "notes",
    downloadAndInstall: vi.fn(),
  };
}

beforeEach(() => {
  harness.reset();
  harness.init();
  updateMocks.check.mockReset();
  resetUpdateState();
});

describe("AppSidebar update badge", () => {
  it("is absent until a check finds a newer release", async () => {
    updateMocks.check.mockResolvedValue(null);
    renderSidebar();
    await act(async () => {
      await checkForUpdate();
    });

    expect(screen.queryByRole("button", { name: "有新版本" })).toBeNull();
    expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument();
  });

  it("marks 设置 itself rather than adding a row of its own", async () => {
    updateMocks.check.mockResolvedValue(fakeRelease());
    renderSidebar();
    await act(async () => {
      await checkForUpdate();
    });

    const badge = await screen.findByRole("button", { name: "有新版本" });
    // The chip hangs off the 设置 row, so the sidebar gained no destination.
    expect(badge.closest("li")).toContainElement(
      screen.getByRole("link", { name: "设置" }),
    );
    // 精选 · 仓库 · 全部 · 我的 skills · 设置 — and nothing else.
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("opens the confirmation dialog from wherever the user is", async () => {
    const user = userEvent.setup();
    updateMocks.check.mockResolvedValue(fakeRelease());
    renderSidebar();
    await act(async () => {
      await checkForUpdate();
    });

    await user.click(await screen.findByRole("button", { name: "有新版本" }));

    // Opening the dialog is the chip's whole job: the globally-mounted
    // UpdateDialog reacts to exactly this, so nobody has to know the update
    // lives under settings — while 设置 stays an ordinary route.
    expect(getUpdateStatus().dialogOpen).toBe(true);
    expect(screen.getByRole("link", { name: "设置" })).toBeInTheDocument();
  });
});
