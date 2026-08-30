import { describe, it, expect } from "vitest";

import { cn, formatCount } from "./utils";

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
