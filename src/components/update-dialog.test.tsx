import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTauri: true,
  check: vi.fn(),
  relaunch: vi.fn(),
  downloadAndInstall: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({ isTauri: () => mocks.isTauri }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import { UpdateDialog } from "./update-dialog";
import {
  checkForUpdate,
  resetUpdateState,
} from "../lib/update-store";

function fakeUpdate() {
  return {
    version: "9.9.9",
    date: "2026-09-01T00:00:00Z",
    notes: "Fixes everything",
    body: "Fixes everything",
    downloaded: false,
    downloadAndInstall: mocks.downloadAndInstall,
  };
}

beforeEach(() => {
  mocks.isTauri = true;
  mocks.check.mockReset();
  mocks.relaunch.mockReset();
  mocks.downloadAndInstall.mockReset();
  resetUpdateState();
});

describe("UpdateDialog", () => {
  it("shows version + notes once an update is available", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    render(<UpdateDialog />);
    await checkForUpdate();

    expect(
      await screen.findByRole("heading", { name: "更新到 v9.9.9" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fixes everything")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "立即更新" }),
    ).toBeInTheDocument();
  });

  it("installs and relaunches when the user confirms", async () => {
    const user = userEvent.setup();
    mocks.check.mockResolvedValue(fakeUpdate());
    mocks.downloadAndInstall.mockImplementation(
      async (onEvent: (event: unknown) => void) => {
        onEvent({ event: "Started", data: { contentLength: 10 } });
        onEvent({ event: "Finished" });
      },
    );
    render(<UpdateDialog />);
    await checkForUpdate();

    await user.click(screen.getByRole("button", { name: "立即更新" }));
    await waitFor(() => expect(mocks.downloadAndInstall).toHaveBeenCalled());
    await waitFor(() => expect(mocks.relaunch).toHaveBeenCalled());
  });

  it("offers a retry when installation fails", async () => {
    const user = userEvent.setup();
    mocks.check.mockResolvedValue(fakeUpdate());
    mocks.downloadAndInstall.mockRejectedValue(new Error("bad signature"));
    render(<UpdateDialog />);
    await checkForUpdate();

    await user.click(screen.getByRole("button", { name: "立即更新" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "更新失败：Error: bad signature",
    );
    expect(
      screen.getByRole("button", { name: "重试更新" }),
    ).toBeInTheDocument();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  it("dismisses without installing (稍后再说)", async () => {
    const user = userEvent.setup();
    mocks.check.mockResolvedValue(fakeUpdate());
    render(<UpdateDialog />);
    await checkForUpdate();

    await user.click(screen.getByRole("button", { name: "稍后再说" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();
  });
});
