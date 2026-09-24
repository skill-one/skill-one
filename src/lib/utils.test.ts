import { describe, it, expect } from "vitest";

import {
  cn,
  errorMessage,
  formatCount,
  formatDate,
  formatDayHeading,
  formatRelativeTime,
} from "./utils";

describe("cn", () => {
  // Joining truthy values, skipping falsy ones and flattening arrays is clsx's
  // own contract; only the conflict merge depends on twMerge being wired here.
  it("resolves conflicting Tailwind classes via tailwind-merge", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});

describe("formatCount", () => {
  it("formats large counts with compact notation", () => {
    expect(formatCount(169600)).toBe("169.6K");
    expect(formatCount(12300)).toBe("12.3K");
  });

  it("formats smaller counts without a suffix", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(0)).toBe("0");
  });
});

describe("formatDate", () => {
  it("returns null for a missing or unparseable stamp", () => {
    expect(formatDate(undefined, "en")).toBeNull();
    expect(formatDate("not a date", "en")).toBeNull();
  });
});

describe("formatDayHeading", () => {
  // Local midnights built from explicit calendar dates, so the assertions hold
  // in whatever zone the suite runs in.
  const day = (year: number, month: number, dayOfMonth: number) =>
    new Date(year, month - 1, dayOfMonth).getTime();
  // An afternoon in 2026, the year the "same year" cases live in.
  const now = day(2026, 9, 24) + 15 * 60 * 60 * 1000;

  it("reads a day of the current year as month and day alone", () => {
    expect(formatDayHeading(day(2026, 9, 22), "zh", now)).toBe("9月22日");
    expect(formatDayHeading(day(2026, 1, 3), "zh", now)).toBe("1月3日");
    expect(formatDayHeading(day(2026, 9, 22), "en", now)).toBe("September 22");
  });

  it("carries the year on a day of another year", () => {
    expect(formatDayHeading(day(2025, 12, 3), "zh", now)).toBe("2025年12月3日");
    expect(formatDayHeading(day(2025, 12, 3), "en", now)).toBe(
      "December 3, 2025",
    );
  });
});

describe("formatRelativeTime", () => {
  // A fixed clock, so the bucketing is provable without freezing global time.
  const NOW = Date.parse("2026-09-19T12:00:00Z");
  const ago = (seconds: number) => Math.floor(NOW / 1000) - seconds;

  it("returns null for a missing or unusable stamp", () => {
    expect(formatRelativeTime(undefined, "zh")).toBeNull();
    expect(formatRelativeTime(null, "zh")).toBeNull();
    expect(formatRelativeTime(Number.NaN, "zh")).toBeNull();
  });

  it("counts the whole units that have passed", () => {
    // 47 hours is one day that has passed, not two rounded up.
    expect(formatRelativeTime(ago(47 * 3600), "zh", NOW)).toBe("1天前");
    expect(formatRelativeTime(ago(3 * 86400), "zh", NOW)).toBe("3天前");
    expect(formatRelativeTime(ago(45 * 86400), "zh", NOW)).toBe("1个月前");
    expect(formatRelativeTime(ago(800 * 86400), "zh", NOW)).toBe("2年前");
  });

  it("keeps every bucket uniform rather than idiomatic per bucket", () => {
    // `numeric: "auto"` would say 昨天 / 上个月 / 去年 here. A fact is more
    // useful than an idiom, and the exact date is one hover away.
    expect(formatRelativeTime(ago(86400), "zh", NOW)).toBe("1天前");
    expect(formatRelativeTime(ago(40 * 86400), "zh", NOW)).toBe("1个月前");
    expect(formatRelativeTime(ago(400 * 86400), "zh", NOW)).toBe("1年前");
  });

  it("reads the last minute as 刚刚", () => {
    expect(formatRelativeTime(ago(30), "zh", NOW)).toBe("刚刚");
  });

  it("reports a stamp ahead of the clock as such, not as the past", () => {
    // Only clock skew or a hand-made directory produces one; saying 2小时后
    // is honest about what the filesystem reported.
    expect(formatRelativeTime(ago(-2 * 3600), "zh", NOW)).toBe("2小时后");
  });
});

describe("errorMessage", () => {
  it("prefers an Error's message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("surfaces a bare string, which is how Tauri commands reject", () => {
    expect(errorMessage("no such skill")).toBe("no such skill");
  });

  it("reads a message off a non-Error object", () => {
    expect(errorMessage({ message: "from the payload" })).toBe(
      "from the payload",
    );
  });

  it("falls back when nothing usable is there", () => {
    expect(errorMessage(new Error(""))).toBe("Unknown error");
    expect(errorMessage(undefined)).toBe("Unknown error");
    expect(errorMessage("   ")).toBe("Unknown error");
    expect(errorMessage(null, "Remove failed")).toBe("Remove failed");
  });
});
