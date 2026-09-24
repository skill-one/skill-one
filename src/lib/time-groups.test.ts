import { describe, it, expect } from "vitest";

import {
  TIME_BUCKETS,
  timeBucketOf,
  groupByInstallTime,
  compareByInstalledTime,
  newestInstallTime,
  type TimeBucketKey,
} from "./time-groups";

describe("timeBucketOf", () => {
  // A fixed afternoon, expressed in local time: every boundary is local
  // midnight, so the fixtures are offsets of that midnight too, which keeps
  // the assertions true in whatever zone the suite runs in.
  const now = new Date(2026, 8, 24, 15, 30);
  const midnight = new Date(2026, 8, 24).getTime() / 1000;
  const DAY = 24 * 60 * 60;
  const at = (daysOffset: number, secondsIntoDay = 0) =>
    midnight + daysOffset * DAY + secondsIntoDay;

  it("files a same-day install into 今天", () => {
    expect(timeBucketOf(at(0, 9 * 3600), now)).toBe("today");
  });

  it("files a stamp ahead of the clock into 今天 rather than failing", () => {
    // Clock skew or a hand-made directory: it is still the newest thing on
    // disk, so it reads with the newest bucket.
    expect(timeBucketOf(at(0, 23 * 3600), now)).toBe("today");
    expect(timeBucketOf(at(2, 0), now)).toBe("today");
  });

  it("files yesterday's calendar day into 昨天", () => {
    expect(timeBucketOf(at(-1, 0), now)).toBe("yesterday");
    expect(timeBucketOf(at(-1, 23 * 3600 + 59 * 60), now)).toBe("yesterday");
  });

  it("files the rest of the week window into 近7天", () => {
    // Two whole days ago, and the edge exactly seven midnights back: both are
    // inside "the last seven calendar days" but outside the two named days.
    expect(timeBucketOf(at(-2, 12 * 3600), now)).toBe("week");
    expect(timeBucketOf(at(-7, 0), now)).toBe("week");
  });

  it("files the rest of the month window into 近30天", () => {
    expect(timeBucketOf(at(-8, 0), now)).toBe("month");
    expect(timeBucketOf(at(-30, 0), now)).toBe("month");
  });

  it("files anything older into 更早", () => {
    expect(timeBucketOf(at(-31, 0), now)).toBe("earlier");
    expect(timeBucketOf(at(-400, 0), now)).toBe("earlier");
  });

  it("files a missing or unusable stamp into 时间未知", () => {
    expect(timeBucketOf(undefined, now)).toBe("unknown");
    expect(timeBucketOf(null, now)).toBe("unknown");
    expect(timeBucketOf(Number.NaN, now)).toBe("unknown");
  });

  it("uses the real clock by default", () => {
    // Sanity rather than a fixed fact: a stamp now is always today.
    expect(timeBucketOf(Math.floor(Date.now() / 1000))).toBe("today");
  });
});

describe("groupByInstallTime", () => {
  const now = new Date(2026, 8, 24, 15, 30);
  const midnight = new Date(2026, 8, 24).getTime() / 1000;
  const DAY = 24 * 60 * 60;

  interface Item {
    name: string;
    at: number | null;
  }
  const item = (name: string, daysOffset: number): Item => ({
    name,
    at: midnight + daysOffset * DAY,
  });

  it("omits empty buckets and keeps the fixed newest-first order", () => {
    const groups = groupByInstallTime(
      [item("old", -100), item("fresh", 0), item("weekish", -3)],
      (i) => i.at,
      now,
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "week", "earlier"]);
    expect(groups.map((g) => g.title)).toEqual([
      "time.today",
      "time.week",
      "time.earlier",
    ]);
  });

  it("orders the items inside a bucket newest-first", () => {
    const groups = groupByInstallTime(
      [item("a", -45), item("b", -200), item("c", -400)],
      (i) => i.at,
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("files the whole surface as buckets in display order", () => {
    const keys = TIME_BUCKETS.map((b) => b.key);
    expect(keys).toEqual([
      "today",
      "yesterday",
      "week",
      "month",
      "earlier",
      "unknown",
    ]);
  });

  it("keeps equal timestamps in incoming order and never reorders 时间未知", () => {
    const sameA = item("a", -3);
    const sameB = item("b", -3);
    const unknowns: Item[] = [
      { name: "u1", at: null },
      { name: "u2", at: null },
    ];
    const groups = groupByInstallTime(
      [sameA, sameB, ...unknowns],
      (i) => i.at,
      now,
    );
    const week = groups.find((g) => g.key === "week");
    const unknown = groups.find((g) => g.key === "unknown");
    expect(week?.items.map((i) => i.name)).toEqual(["a", "b"]);
    // No timestamp means no provable order: the incoming order is preserved.
    expect(unknown?.items.map((i) => i.name)).toEqual(["u1", "u2"]);
  });

  it("returns an empty filing for an empty list", () => {
    expect(groupByInstallTime([], () => 0, now)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [item("old", -100), item("fresh", 0)];
    const snapshot = input.map((i) => i.name);
    groupByInstallTime(input, (i) => i.at, now);
    expect(input.map((i) => i.name)).toEqual(snapshot);
  });

  it("accepts the bucket keys as a closed union", () => {
    // Compile-time guard that the renderer can switch on every key.
    const expected: TimeBucketKey[] = [
      "today",
      "yesterday",
      "week",
      "month",
      "earlier",
      "unknown",
    ];
    expect(TIME_BUCKETS.map((b) => b.key)).toEqual(expected);
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
