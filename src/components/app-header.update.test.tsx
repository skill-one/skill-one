import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "./app-header";
import { TooltipProvider } from "./ui/tooltip";
import { renderWithRouter } from "../test/test-utils";

// The update chip only ever shows inside Tauri, so — unlike the navigation
// tests — this file forces the desktop environment on. The mocks are scoped to
// this module, leaving app-header.test.tsx (which runs in browser mode)
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

import {
  checkForUpdate,
  getUpdateStatus,
  resetUpdateState,
} from "../lib/update-store";

function renderHeader() {
  return renderWithRouter(
    <TooltipProvider>
      <AppHeader />
    </TooltipProvider>,
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
  updateMocks.check.mockReset();
  resetUpdateState();
});

describe("AppHeader update chip", () => {
  it("is absent until a check finds a newer release", async () => {
    updateMocks.check.mockResolvedValue(null);
    renderHeader();
    await act(async () => {
      await checkForUpdate();
    });

    expect(screen.queryByRole("button", { name: "有新版本" })).toBeNull();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  it("sits beside 设置 rather than adding a destination of its own", async () => {
    updateMocks.check.mockResolvedValue(fakeRelease());
    renderHeader();
    await act(async () => {
      await checkForUpdate();
    });

    const chip = await screen.findByRole("button", { name: "有新版本" });
    // The chip shares the settings slot, so the header gained no destination.
    expect(chip.parentElement).toBe(
      screen.getByRole("button", { name: "设置" }).parentElement,
    );
    // 商店 · 我的 skills — and nothing else.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("opens the confirmation dialog from wherever the user is", async () => {
    const user = userEvent.setup();
    updateMocks.check.mockResolvedValue(fakeRelease());
    renderHeader();
    await act(async () => {
      await checkForUpdate();
    });

    await user.click(await screen.findByRole("button", { name: "有新版本" }));

    // Opening the dialog is the chip's whole job: the globally-mounted
    // UpdateDialog reacts to exactly this, so nobody has to know the update
    // lives under settings — 设置 itself just opens the quick-settings flyout.
    expect(getUpdateStatus().dialogOpen).toBe(true);
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });
});
