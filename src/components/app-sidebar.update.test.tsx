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

import { checkForUpdate, getUpdateStatus, resetUpdateState } from "../lib/update-store";

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

    expect(screen.queryByText(/更新 v/)).not.toBeInTheDocument();
    // 设置 stays put as the anchor the badge sits next to.
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("appears once available, and clicking it opens the confirmation dialog", async () => {
    const user = userEvent.setup();
    updateMocks.check.mockResolvedValue(fakeRelease());
    renderSidebar();
    await act(async () => {
      await checkForUpdate();
    });

    const badge = await screen.findByText("更新 v9.9.9");
    expect(screen.getByText("新")).toBeInTheDocument();

    await user.click(badge.closest("button")!);
    // The badge hands off to the store: opening the dialog is exactly what the
    // globally-mounted UpdateDialog reacts to (covered in update-dialog.test).
    expect(getUpdateStatus().dialogOpen).toBe(true);
    expect(getUpdateStatus().phase).toBe("available");
  });
});
