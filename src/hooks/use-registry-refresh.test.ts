import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const refresh = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("../lib/registry/refresh", () => ({
  checkForRegistryUpdate: refresh.check,
}));

/** Sonner's surface, so the "a newer snapshot landed" notice is assertable. */
const toasts = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("sonner", () => ({ toast: toasts.toast }));

import { useRegistryRefresh } from "./use-registry-refresh";

/** The hook's tick, mirrored here as the interval a test advances past. */
const TICK_MS = 60 * 60 * 1000;

/** Force `document.visibilityState`; jsdom's own getter is read-only. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

describe("useRegistryRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.check.mockReset();
    refresh.check.mockResolvedValue(null);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("re-checks on every tick", () => {
    renderHook(() => useRegistryRefresh());

    vi.advanceTimersByTime(TICK_MS * 3);

    expect(refresh.check).toHaveBeenCalledTimes(3);
  });

  it("asks again when the window comes back into view", () => {
    renderHook(() => useRegistryRefresh());

    // Nothing to do while it is off screen...
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh.check).not.toHaveBeenCalled();

    // ...and a re-check is requested the moment it is visible again, which
    // covers a sleep that swallowed several ticks.
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh.check).toHaveBeenCalledTimes(1);
  });

  it("stops ticking once unmounted", () => {
    const { unmount } = renderHook(() => useRegistryRefresh());
    unmount();

    vi.advanceTimersByTime(TICK_MS * 2);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(refresh.check).not.toHaveBeenCalled();
  });

  it("says so when a check lands a newer snapshot", async () => {
    refresh.check.mockResolvedValue({ status: "updated" });
    renderHook(() => useRegistryRefresh());

    vi.advanceTimersByTime(TICK_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(toasts.toast).toHaveBeenCalledWith("技能数据已更新到最新快照");
  });

  it("stays quiet when the check found nothing new", async () => {
    refresh.check.mockResolvedValue({ status: "current" });
    renderHook(() => useRegistryRefresh());

    vi.advanceTimersByTime(TICK_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(toasts.toast).not.toHaveBeenCalled();
  });
});
