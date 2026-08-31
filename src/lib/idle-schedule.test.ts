import { afterEach, describe, expect, it, vi } from "vitest";

import { scheduleIdle, type IdleSchedule } from "./idle-schedule";

/**
 * Capture the host scheduler the module picks, so each case can assert which
 * one won without having to run a real idle callback.
 */
function stubIdle(): {
  request: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(() => 7 as unknown as number);
  const cancel = vi.fn();
  vi.stubGlobal("requestIdleCallback", request);
  vi.stubGlobal("cancelIdleCallback", cancel);
  return { request, cancel };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scheduleIdle", () => {
  it("uses requestIdleCallback with a timeout when available", () => {
    const { request } = stubIdle();

    const task = vi.fn();
    scheduleIdle(task);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toEqual({ timeout: 500 });
    // The task is deferred, not run inline.
    expect(task).not.toHaveBeenCalled();

    // Running the host callback runs the task.
    request.mock.calls[0][0]({ didTimeout: false, timeRemaining: () => 0 });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("falls back to a timer when requestIdleCallback is missing", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);

    const task = vi.fn();
    scheduleIdle(task);
    expect(task).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
  });

  it("cancels a pending idle callback", () => {
    const { request, cancel } = stubIdle();

    const task = vi.fn();
    const cancelTask = scheduleIdle(task);
    cancelTask();

    expect(cancel).toHaveBeenCalledWith(7);
    // Nothing runs the host callback afterwards, so the task never fires.
    expect(task).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending timer on hosts without requestIdleCallback", async () => {
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.stubGlobal("cancelIdleCallback", undefined);

    const task = vi.fn();
    scheduleIdle(task)();

    // Let any (cancelled) timer deadline pass.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(task).not.toHaveBeenCalled();
  });
});

describe("IdleSchedule", () => {
  it("is satisfied by a custom scheduler", () => {
    const scheduler: IdleSchedule = (task) => {
      task();
      return () => {};
    };
    const task = vi.fn();
    scheduler(task);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
