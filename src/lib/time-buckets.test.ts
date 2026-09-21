import { describe, it, expect } from "vitest";

import { TIME_BUCKETS, timeBucketOf } from "./time-buckets";

const DAY = 24 * 60 * 60;

/**
 * Local noon, not a UTC instant: `今天` is a local-day section, and the tests
 * below offset from here in whole hours and days, so they read the same in
 * every time zone the suite may run in.
 */
const NOW = new Date(2026, 8, 19, 12, 0, 0).getTime();
const ago = (seconds: number) => Math.floor(NOW / 1000) - seconds;

describe("timeBucketOf", () => {
  it("files an install by how long ago it happened", () => {
    expect(timeBucketOf(ago(3600), NOW)).toBe("time-today");
    expect(timeBucketOf(ago(3 * DAY), NOW)).toBe("time-week");
    expect(timeBucketOf(ago(12 * DAY), NOW)).toBe("time-month");
    expect(timeBucketOf(ago(200 * DAY), NOW)).toBe("time-year");
    expect(timeBucketOf(ago(400 * DAY), NOW)).toBe("time-earlier");
  });

  it("reads the first section as the local day, not a trailing 24 hours", () => {
    // 18 hours before local noon is 18:00 yesterday: inside the last 24 hours,
    // but yesterday, so it belongs to a later section.
    expect(timeBucketOf(ago(18 * 3600), NOW)).toBe("time-week");
  });

  it("bounds the rolling windows on the second", () => {
    // Arithmetic bounds — no calendar boundary to smuggle in a locale's idea
    // of when a week starts.
    expect(timeBucketOf(ago(7 * DAY - 60), NOW)).toBe("time-week");
    expect(timeBucketOf(ago(7 * DAY + 60), NOW)).toBe("time-month");
    expect(timeBucketOf(ago(30 * DAY - 60), NOW)).toBe("time-month");
    expect(timeBucketOf(ago(30 * DAY + 60), NOW)).toBe("time-year");
    expect(timeBucketOf(ago(365 * DAY - 60), NOW)).toBe("time-year");
    expect(timeBucketOf(ago(365 * DAY + 60), NOW)).toBe("time-earlier");
  });

  it("keeps a skill with no recorded install time out of the ladder", () => {
    expect(timeBucketOf(null, NOW)).toBe("time-unknown");
    expect(timeBucketOf(undefined, NOW)).toBe("time-unknown");
    expect(timeBucketOf(Number.NaN, NOW)).toBe("time-unknown");
  });

  it("returns only keys the caller can find a section for", () => {
    // A key missing from TIME_BUCKETS would silently drop the skill from the
    // list, so the ladder and the section list have to stay in step.
    const keys: string[] = TIME_BUCKETS.map((bucket) => bucket.key);
    const produced = [
      ago(3600),
      ago(3 * DAY),
      ago(12 * DAY),
      ago(200 * DAY),
      ago(400 * DAY),
      null,
    ].map((seconds) => timeBucketOf(seconds, NOW));
    for (const key of produced) expect(keys).toContain(key);
    // Newest first: the timeline's reading order is the list's own order.
    expect(keys[0]).toBe("time-today");
  });
});
