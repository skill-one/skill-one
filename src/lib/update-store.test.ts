import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the native plugins + Tauri detection so the store's state machine can
// be exercised in plain jsdom.
const mocks = vi.hoisted(() => ({
  isTauri: false,
  check: vi.fn(),
  relaunch: vi.fn(),
  downloadAndInstall: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri: () => mocks.isTauri }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import {
  checkForUpdate,
  closeUpdateDialog,
  dismissUpdate,
  getUpdateStatus,
  installUpdate,
  openUpdateDialog,
  resetUpdateState,
  subscribeUpdate,
} from "./update-store";

/** A fake `Update` object shaped like the plugin's return value. */
function fakeUpdate(version = "9.9.9") {
  return {
    version,
    date: "2026-09-01T00:00:00Z",
    notes: "Some release notes",
    body: "Some release notes",
    downloaded: false,
    downloadAndInstall: mocks.downloadAndInstall,
  };
}

beforeEach(() => {
  vi.resetModules();
  mocks.isTauri = true;
  mocks.check.mockReset();
  mocks.relaunch.mockReset();
  mocks.downloadAndInstall.mockReset();
  resetUpdateState();
});

describe("update-store", () => {
  it("reports an error outside Tauri without touching the plugin", async () => {
    mocks.isTauri = false;
    await checkForUpdate();
    expect(mocks.check).not.toHaveBeenCalled();
    expect(getUpdateStatus().phase).toBe("error");
  });

  it("moves to upToDate when the endpoint has no newer release", async () => {
    mocks.check.mockResolvedValue(null);
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("upToDate");
  });

  it("exposes version + notes when an update is available", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();
    const status = getUpdateStatus();
    expect(status.phase).toBe("available");
    expect(status.version).toBe("9.9.9");
    expect(status.notes).toBe("Some release notes");
  });

  it("surfaces plugin failures through the error phase", async () => {
    mocks.check.mockRejectedValue(new Error("signature verified: false"));
    await checkForUpdate();
    const status = getUpdateStatus();
    expect(status.phase).toBe("error");
    expect(status.error).toContain("signature verified: false");
  });

  it("dismiss resets to idle", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();
    dismissUpdate();
    expect(getUpdateStatus().phase).toBe("idle");
  });

  it("installUpdate streams progress percentages then relaunches", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();

    mocks.downloadAndInstall.mockImplementation(
      async (onEvent: (event: unknown) => void) => {
        onEvent({ event: "Started", data: { contentLength: 200 } });
        onEvent({ event: "Progress", data: { chunkLength: 100 } });
        onEvent({ event: "Progress", data: { chunkLength: 100 } });
        onEvent({ event: "Finished" });
      },
    );

    const percents: number[] = [];
    await installUpdate((percent) => percents.push(percent));
    expect(percents).toEqual([0, 50, 99, 100]);
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });

  it("installUpdate is a no-op without a pending update", async () => {
    await installUpdate(() => {});
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  it("notifies subscribers on every state change", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUpdate(listener);
    mocks.check.mockResolvedValue(null);
    await checkForUpdate();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await checkForUpdate();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("update-store throttle", () => {
  it("collapses repeated automatic checks into one request", async () => {
    mocks.check.mockResolvedValue(null);
    await checkForUpdate(); // startup
    await checkForUpdate(); // a focus hop lands inside the window
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  it("lets a manual force bypass the throttle window", async () => {
    mocks.check.mockResolvedValue(null);
    await checkForUpdate();
    await checkForUpdate({ force: true }); // the settings-page button
    expect(mocks.check).toHaveBeenCalledTimes(2);
  });

  it("clears the throttle on failure so the next automatic check retries", async () => {
    mocks.check.mockRejectedValueOnce(new Error("offline"));
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("error");
    // The cold-start race must not lock the user out for a full interval.
    mocks.check.mockResolvedValue(null);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(2);
    expect(getUpdateStatus().phase).toBe("upToDate");
  });

  it("leaves the current phase untouched when throttled", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("available");
    // A skipped check must not reset an open dialog to checking/idle.
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("available");
  });
});

describe("update-store dialog control", () => {
  it("does not open the dialog until the user asks", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();
    // available alone surfaces the badge, not the modal.
    expect(getUpdateStatus().phase).toBe("available");
    expect(getUpdateStatus().dialogOpen).toBe(false);
    openUpdateDialog();
    expect(getUpdateStatus().dialogOpen).toBe(true);
  });

  it("ignores an open request when nothing is available", async () => {
    mocks.check.mockResolvedValue(null);
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("upToDate");
    openUpdateDialog();
    expect(getUpdateStatus().dialogOpen).toBe(false);
  });

  it("closes the dialog but keeps `available` so the badge persists", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();
    openUpdateDialog();
    closeUpdateDialog();
    const status = getUpdateStatus();
    expect(status.dialogOpen).toBe(false);
    expect(status.phase).toBe("available");
  });
});
