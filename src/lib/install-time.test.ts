import { describe, it, expect } from "vitest";

import { compareByInstalledTime, newestInstallTime } from "./install-time";

describe("compareByInstalledTime", () => {
  interface Timed {
    name: string;
    at: number | null | undefined;
  }
  const byName = (a: Timed, b: Timed) => a.name.localeCompare(b.name);
  const timed = (name: string, at: number | null): Timed => ({ name, at });

  it("orders newest first", () => {
    const items = [timed("a", 10), timed("b", 200), timed("c", 50)];
    items.sort(compareByInstalledTime((i) => i.at));
    expect(items.map((i) => i.name)).toEqual(["b", "c", "a"]);
  });

  it("settles items without a timestamp last", () => {
    const items = [timed("u1", null), timed("fresh", 10), timed("u2", null)];
    items.sort(compareByInstalledTime((i) => i.at, byName));
    expect(items.map((i) => i.name)).toEqual(["fresh", "u1", "u2"]);
  });

  it("lets a tie-break order equal stamps without outranking time", () => {
    const items = [timed("z", 10), timed("a", 10), timed("m", 200)];
    items.sort(compareByInstalledTime((i) => i.at, byName));
    expect(items.map((i) => i.name)).toEqual(["m", "a", "z"]);
  });

  it("treats undefined like a missing timestamp", () => {
    const items: Timed[] = [{ name: "u", at: undefined }, timed("fresh", 10)];
    items.sort(compareByInstalledTime((i) => i.at));
    expect(items.map((i) => i.name)).toEqual(["fresh", "u"]);
  });
});

describe("newestInstallTime", () => {
  it("takes the maximum timestamp", () => {
    expect(
      newestInstallTime(
        [10, 200, 50].map((at) => ({ at })),
        (i) => i.at,
      ),
    ).toBe(200);
  });

  it("ignores missing stamps and reports null when none exist", () => {
    expect(
      newestInstallTime(
        [null, undefined, 42, null].map((at) => ({ at })),
        (i) => i.at,
      ),
    ).toBe(42);
    expect(newestInstallTime([], () => 0)).toBeNull();
    expect(newestInstallTime([{ at: null }], (i) => i.at)).toBeNull();
  });
});
