import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the native plugins + Tauri detection so the store's state machine can
// be exercised in plain jsdom. `invoke` stands in for the Rust
// `is_homebrew_install` probe: `managed` is its answer, `probeFails` a broken
// bridge. It is a plain async function rather than a `vi.fn()` so that a stray
// `restoreAllMocks` can never turn it back into a non-thenable.
const mocks = vi.hoisted(() => ({
  isTauri: false,
  managed: false,
  probeFails: false,
  check: vi.fn(),
  relaunch: vi.fn(),
  downloadAndInstall: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri: () => mocks.isTauri }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async () => {
    if (mocks.probeFails) throw new Error("no such command");
    return mocks.managed;
  },
}));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

import {
  CHECK_TIMEOUT_MS,
  FAILURE_BACKOFF_BASE_MS,
  MIN_CHECK_INTERVAL_MS,
  checkForUpdate,
  closeUpdateDialog,
  getUpdateStatus,
  installUpdate,
  openUpdateDialog,
  resetUpdateState,
  subscribeUpdate,
} from "./update-store";
import { resetUpdateChannel } from "./update-channel";

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

// The store reads the wall clock to throttle; a hand-cranked clock keeps the
// backoff tests deterministic without fake timers fighting the plugin mocks.
// It starts at a realistic epoch on purpose: the store treats `lastCheckedAt =
// 0` as "never checked", so a small base would read as *inside* the very first
// throttle window and silently skip every automatic check.
const CLOCK_BASE = Date.parse("2026-09-12T00:00:00Z");
let clock = CLOCK_BASE;

function advance(ms: number) {
  clock += ms;
}

beforeEach(() => {
  clock = CLOCK_BASE;
  mocks.isTauri = true;
  mocks.managed = false;
  mocks.probeFails = false;
  mocks.check.mockReset();
  mocks.relaunch.mockReset();
  mocks.downloadAndInstall.mockReset();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  resetUpdateState();
  resetUpdateChannel();
});

afterEach(() => {
  // Only the clock is a spy; `restoreAllMocks` would also strip the plugin
  // mocks' implementations, which every test re-arms itself.
  vi.mocked(Date.now).mockRestore();
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

  it("bounds the request with a timeout so a stall cannot pin the store", async () => {
    mocks.check.mockResolvedValue(null);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledWith({ timeout: CHECK_TIMEOUT_MS });
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

    const percents: (number | null)[] = [];
    await installUpdate((percent) => percents.push(percent));
    expect(percents).toEqual([0, 50, 99, 100]);
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
  });

  it("reports an unknown download size as null, not a stuck 0%", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();

    mocks.downloadAndInstall.mockImplementation(
      async (onEvent: (event: unknown) => void) => {
        // No `contentLength`: the server sent no total, so there is no ratio
        // to report and the Progress ticks below must be swallowed.
        onEvent({ event: "Started", data: {} });
        onEvent({ event: "Progress", data: { chunkLength: 4096 } });
        onEvent({ event: "Finished" });
      },
    );

    const percents: (number | null)[] = [];
    await installUpdate((percent) => percents.push(percent));
    expect(percents).toEqual([null, 100]);
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

describe("update-store failure handling", () => {
  it("stays quiet when a background check fails", async () => {
    mocks.check.mockRejectedValue(new Error("offline"));
    await checkForUpdate();
    // Nobody asked: no error banner, just a backed-off retry.
    expect(getUpdateStatus().phase).toBe("idle");
  });

  it("reports the reason when the user asks and the check fails", async () => {
    mocks.check.mockRejectedValue(new Error("signature verified: false"));
    await checkForUpdate({ force: true });
    const status = getUpdateStatus();
    expect(status.phase).toBe("error");
    expect(status.error).toContain("signature verified: false");
  });

  it("keeps a discovered update when a later background check fails", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();

    advance(MIN_CHECK_INTERVAL_MS);
    mocks.check.mockRejectedValue(new Error("offline"));
    await checkForUpdate();

    // A hiccup must not retract an update the user was already told about.
    const status = getUpdateStatus();
    expect(status.phase).toBe("available");
    expect(status.version).toBe("9.9.9");
  });

  it("doubles the retry window per consecutive failure", async () => {
    mocks.check.mockRejectedValue(new Error("offline"));

    await checkForUpdate(); // attempt 1
    expect(mocks.check).toHaveBeenCalledTimes(1);

    advance(FAILURE_BACKOFF_BASE_MS - 1);
    await checkForUpdate(); // still inside the first backoff step
    expect(mocks.check).toHaveBeenCalledTimes(1);

    advance(1);
    await checkForUpdate(); // attempt 2
    expect(mocks.check).toHaveBeenCalledTimes(2);

    // The second failure doubles the window, so the same gap now falls short.
    advance(FAILURE_BACKOFF_BASE_MS);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(2);

    advance(FAILURE_BACKOFF_BASE_MS);
    await checkForUpdate(); // attempt 3
    expect(mocks.check).toHaveBeenCalledTimes(3);
  });

  it("caps the backoff at the steady-state interval", async () => {
    mocks.check.mockRejectedValue(new Error("offline"));
    // Twelve failures would ask for 2min * 2^11; the cap must hold it at 8h.
    for (let i = 0; i < 12; i += 1) {
      advance(MIN_CHECK_INTERVAL_MS);
      await checkForUpdate();
    }
    const callsBefore = mocks.check.mock.calls.length;

    advance(MIN_CHECK_INTERVAL_MS - 1);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(callsBefore);

    advance(1);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(callsBefore + 1);
  });

  it("resets the backoff after a successful check", async () => {
    mocks.check.mockRejectedValueOnce(new Error("offline"));
    await checkForUpdate();

    advance(FAILURE_BACKOFF_BASE_MS);
    mocks.check.mockResolvedValue(null);
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("upToDate");

    // Back to the steady-state window: the doubled step is gone.
    advance(MIN_CHECK_INTERVAL_MS - 1);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(2);

    advance(1);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(3);
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

  it("leaves the current phase untouched when throttled", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("available");
    // A skipped check must not reset an open dialog to checking/idle.
    await checkForUpdate();
    expect(getUpdateStatus().phase).toBe("available");
  });

  it("does not check while an install is running", async () => {
    let release!: () => void;
    mocks.check.mockResolvedValue(fakeUpdate());
    mocks.downloadAndInstall.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await checkForUpdate();

    const installing = installUpdate(() => {});
    advance(MIN_CHECK_INTERVAL_MS);
    await checkForUpdate();

    // Mid-download the dialog owns the screen: a check that emitted `checking`
    // would unmount it and hide the progress.
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(getUpdateStatus().phase).toBe("available");

    release();
    await installing;
  });

  it("does not check while the confirmation dialog is open", async () => {
    mocks.check.mockResolvedValue(fakeUpdate());
    await checkForUpdate();
    openUpdateDialog();

    advance(MIN_CHECK_INTERVAL_MS);
    await checkForUpdate();

    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(getUpdateStatus().dialogOpen).toBe(true);

    closeUpdateDialog();
    advance(MIN_CHECK_INTERVAL_MS);
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(2);
  });
});

describe("update-store homebrew installs", () => {
  it("stands down and tells the user to use brew", async () => {
    mocks.managed = true;
    await checkForUpdate();
    // Self-updating a cask-managed bundle would desync the cask.
    expect(mocks.check).not.toHaveBeenCalled();
    expect(getUpdateStatus().phase).toBe("managed");
  });

  it("stands down on a manual check too", async () => {
    mocks.managed = true;
    await checkForUpdate({ force: true });
    expect(mocks.check).not.toHaveBeenCalled();
    expect(getUpdateStatus().phase).toBe("managed");
  });

  it("falls back to self-update when the probe fails", async () => {
    mocks.probeFails = true;
    mocks.check.mockResolvedValue(null);

    // A broken probe must never strand the user on an old version.
    await checkForUpdate();
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(getUpdateStatus().phase).toBe("upToDate");
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
