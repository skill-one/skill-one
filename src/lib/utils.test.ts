import { describe, it, expect } from "vitest";

import { cn, errorMessage, formatCount, formatDate, formatRev } from "./utils";

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
  it("returns null for a missing or unparseable stamp", () => {
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate("not a date")).toBeNull();
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
    expect(errorMessage(new Error(""))).toBe("未知错误");
    expect(errorMessage(undefined)).toBe("未知错误");
    expect(errorMessage("   ")).toBe("未知错误");
    expect(errorMessage(null, "移除失败")).toBe("移除失败");
  });
});
