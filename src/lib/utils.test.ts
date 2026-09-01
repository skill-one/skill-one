import { describe, it, expect } from "vitest";

import { cn, formatCount, formatDate, formatRev } from "./utils";

describe("cn", () => {
  it("joins truthy class values", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("handles conditional object/array inputs", () => {
    expect(cn("a", { b: true, c: false }, ["d", "e"])).toBe("a b d e");
  });

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

describe("formatRev", () => {
  it("keeps the hash head and drops the fingerprint-scheme segment", () => {
    expect(formatRev("t1-a4cf6ce14f6d65b3")).toBe("#a4cf6ce1");
  });

  it("tolerates a fingerprint without a scheme segment", () => {
    expect(formatRev("a4cf6ce14f6d65b3")).toBe("#a4cf6ce1");
  });

  it("does not pad a hash shorter than the display width", () => {
    expect(formatRev("t1-abcd")).toBe("#abcd");
  });
});

describe("formatDate", () => {
  it("renders an ISO timestamp as a locale date", () => {
    expect(formatDate("2026-08-12T04:34:54Z")).toBe(
      new Date("2026-08-12T04:34:54Z").toLocaleDateString(),
    );
  });

  it("returns null for a missing or unparseable stamp", () => {
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate("not a date")).toBeNull();
  });
});
