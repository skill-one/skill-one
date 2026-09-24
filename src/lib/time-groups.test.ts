import { describe, it, expect } from "vitest";

import {
  dayFilingOf,
  groupByInstallTime,
  compareByInstalledTime,
  newestInstallTime,
} from "./time-groups";

describe("dayFilingOf", () => {
  // A fixed afternoon, expressed in local time. Stamps are built from explicit
  // local calendar dates rather than midnight offsets, so the assertions stay
  // true in whatever zone (and across whatever DST shifts) the suite runs in.
  const now = new Date(2026, 8, 24, 15, 30);
  const at = (year: number, month: number, day: number, hour = 0) =>
    Math.floor(new Date(year, month - 1, day, hour).getTime() / 1000);
  const midnightOf = (year: number, month: number, day: number) =>
    new Date(year, month - 1, day).getTime();

  it("files a same-day install into 今天", () => {
    expect(dayFilingOf(at(2026, 9, 24, 9), now)).toEqual({
      key: "today",
      titleKey: "time.today",
      start: null,
    });
  });

  it("files a stamp ahead of the clock into 今天 rather than failing", () => {
    // Clock skew or a hand-made directory: it is still the newest thing on
    // disk, so it reads with the newest day.
    expect(dayFilingOf(at(2026, 9, 24, 23), now)).toEqual({
      key: "today",
      titleKey: "time.today",
      start: null,
    });
    expect(dayFilingOf(at(2026, 9, 30), now)).toEqual({
      key: "today",
      titleKey: "time.today",
      start: null,
    });
  });

  it("files yesterday's calendar day into 昨天", () => {
    expect(dayFilingOf(at(2026, 9, 23), now)).toEqual({
      key: "yesterday",
      titleKey: "time.yesterday",
      start: null,
    });
    expect(dayFilingOf(at(2026, 9, 23, 23), now)).toEqual({
      key: "yesterday",
      titleKey: "time.yesterday",
      start: null,
    });
  });

  it("gives every older day its own key and its midnight to format", () => {
    // A dated day carries no i18n key: the render layer formats `start` in
    // the locale the UI renders in (see `formatDayHeading`).
    expect(dayFilingOf(at(2026, 9, 22, 12), now)).toEqual({
      key: "2026-09-22",
      titleKey: null,
      start: midnightOf(2026, 9, 22),
    });
    expect(dayFilingOf(at(2026, 1, 3), now)).toEqual({
      key: "2026-01-03",
      titleKey: null,
      start: midnightOf(2026, 1, 3),
    });
    expect(dayFilingOf(at(2025, 12, 3), now)).toEqual({
      key: "2025-12-03",
      titleKey: null,
      start: midnightOf(2025, 12, 3),
    });
  });

  it("files a missing or unusable stamp nowhere", () => {
    expect(dayFilingOf(undefined, now)).toBeNull();
    expect(dayFilingOf(null, now)).toBeNull();
    expect(dayFilingOf(Number.NaN, now)).toBeNull();
  });

  it("uses the real clock by default", () => {
    // Sanity rather than a fixed fact: a stamp now is always today.
    expect(dayFilingOf(Math.floor(Date.now() / 1000))?.key).toBe("today");
  });
});

describe("groupByInstallTime", () => {
  const now = new Date(2026, 8, 24, 15, 30);
  const DAY = 24 * 60 * 60;
  // Same stamp arithmetic the page's own clocks produce: whole days back from
  // the fixed afternoon, so every fixture lands squarely inside its day.
  const at = (daysBack: number) =>
    Math.floor(now.getTime() / 1000) - daysBack * DAY;

  interface Item {
    name: string;
    at: number | null;
  }
  const item = (name: string, daysBack: number): Item => ({
    name,
    at: at(daysBack),
  });

  it("gives each day that holds an install its own group, newest first", () => {
    const groups = groupByInstallTime(
      [item("old", 100), item("fresh", 0), item("recent", 3)],
      (i) => i.at,
      now,
    );
    expect(groups.map((g) => g.key)).toEqual([
      "today",
      "2026-09-21",
      "2026-06-16",
    ]);
    expect(groups.map((g) => g.titleKey)).toEqual([
      "time.today",
      null,
      null,
    ]);
  });

  it("pools installs of the same day into one group", () => {
    const groups = groupByInstallTime(
      [item("a", 45), item("b", 45), item("c", 3)],
      (i) => i.at,
      now,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("2026-09-21");
    expect(groups[0].items.map((i) => i.name)).toEqual(["c"]);
    expect(groups[1].key).toBe("2026-08-10");
    expect(groups[1].items.map((i) => i.name)).toEqual(["a", "b"]);
    // A dated group carries its own midnight for the render layer.
    expect(groups[1].start).toBe(new Date(2026, 7, 10).getTime());
  });

  it("orders the items inside a day newest-first", () => {
    const groups = groupByInstallTime(
      [
        { name: "a", at: at(45) - 200 },
        { name: "b", at: at(45) },
        { name: "c", at: at(45) - 400 },
      ],
      (i) => i.at,
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.name)).toEqual(["b", "a", "c"]);
  });

  it("keeps equal timestamps in incoming order and never reorders 时间未知", () => {
    const sameA = item("a", 3);
    const sameB = item("b", 3);
    const unknowns: Item[] = [
      { name: "u1", at: null },
      { name: "u2", at: null },
    ];
    const groups = groupByInstallTime(
      [sameA, sameB, ...unknowns],
      (i) => i.at,
      now,
    );
    const day = groups.find((g) => g.key === "2026-09-21");
    const unknown = groups.find((g) => g.key === "unknown");
    // The stampless pool trails every day, under its own header.
    expect(groups.at(-1)?.key).toBe("unknown");
    expect(day?.items.map((i) => i.name)).toEqual(["a", "b"]);
    // No timestamp means no provable order: the incoming order is preserved.
    expect(unknown?.items.map((i) => i.name)).toEqual(["u1", "u2"]);
    expect(unknown?.titleKey).toBe("time.unknown");
    expect(unknown?.start).toBeNull();
  });

  it("returns an empty filing for an empty list", () => {
    expect(groupByInstallTime([], () => 0, now)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [item("old", 100), item("fresh", 0)];
    const snapshot = input.map((i) => i.name);
    groupByInstallTime(input, (i) => i.at, now);
    expect(input.map((i) => i.name)).toEqual(snapshot);
  });
});

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
