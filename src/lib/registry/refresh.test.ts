import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexInfo, RevalidateResult } from "./protocol";

const client = vi.hoisted(() => ({
  /** Snapshot the mocked client serves; only `index.checkedAt` is read. */
  index: null as IndexInfo | null,
  revalidate: vi.fn(),
}));

vi.mock("./client", () => ({
  getRegistrySnapshot: () => ({ index: client.index }),
  revalidateRegistry: client.revalidate,
}));

import { STALE_AFTER_MS, checkForRegistryUpdate } from "./refresh";

/** A fixed "now" so the window arithmetic is exact. */
const NOW = 1_700_000_000_000;

/** A served snapshot whose last completed check was `age` ms ago. */
function checked(age: number): IndexInfo {
  return { origin: "unchanged", checkedAt: NOW - age };
}

describe("checkForRegistryUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    client.index = null;
    client.revalidate.mockReset();
    client.revalidate.mockResolvedValue({ status: "current" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("leaves a fresh snapshot alone", async () => {
    client.index = checked(STALE_AFTER_MS - 1);

    await expect(checkForRegistryUpdate()).resolves.toBeNull();
    expect(client.revalidate).not.toHaveBeenCalled();
  });

  it("checks again once the window has passed", async () => {
    client.index = checked(STALE_AFTER_MS);

    await expect(checkForRegistryUpdate()).resolves.toEqual({
      status: "current",
    });
    expect(client.revalidate).toHaveBeenCalledTimes(1);
  });

  it("treats a never-checked snapshot as due rather than fresh", async () => {
    // No identity at all, and a cache-served identity with no recorded check:
    // neither has ever been confirmed against the published one, so waiting a
    // full window would strand it.
    await expect(checkForRegistryUpdate()).resolves.toEqual({
      status: "current",
    });
    client.index = { origin: "cache" };
    await expect(checkForRegistryUpdate()).resolves.toEqual({
      status: "current",
    });
    expect(client.revalidate).toHaveBeenCalledTimes(2);
  });

  it("checks regardless of the window when asked to", async () => {
    client.index = checked(0);

    await expect(checkForRegistryUpdate({ force: true })).resolves.toEqual({
      status: "current",
    });
    expect(client.revalidate).toHaveBeenCalledTimes(1);
  });

  it("shares one probe between concurrent callers", async () => {
    let release!: (result: RevalidateResult) => void;
    client.revalidate.mockImplementation(
      () => new Promise<RevalidateResult>((resolve) => (release = resolve)),
    );

    const first = checkForRegistryUpdate({ force: true });
    const second = checkForRegistryUpdate({ force: true });
    expect(client.revalidate).toHaveBeenCalledTimes(1);

    release({ status: "updated" });
    await expect(first).resolves.toEqual({ status: "updated" });
    await expect(second).resolves.toEqual({ status: "updated" });
  });

  it("probes afresh once the shared probe has settled", async () => {
    await checkForRegistryUpdate({ force: true });
    await checkForRegistryUpdate({ force: true });

    expect(client.revalidate).toHaveBeenCalledTimes(2);
  });
});
