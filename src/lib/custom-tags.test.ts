import { describe, it, expect } from "vitest";

import { UNCLASSIFIED_DOMAIN, domainMeta } from "../data/domains";
import { domainsOf } from "./domain-filter";
import {
  collectTakenTagKeys,
  customTagMeta,
  defaultTagMark,
  effectiveDomains,
  normalizeTagEmoji,
  normalizeTagKey,
  validateNewTag,
} from "./custom-tags";

// User tags extend the system taxonomy without touching it: keys fold
// whitespace, validation reserves system keys, and the effective
// classification is one override read ahead of the store's answer.

describe("normalizeTagKey", () => {
  it("trims and folds whitespace runs to a single dash", () => {
    expect(normalizeTagKey("  效率  工具 ")).toBe("效率-工具");
    expect(normalizeTagKey("my tag")).toBe("my-tag");
  });

  it("answers empty when nothing usable is left", () => {
    expect(normalizeTagKey("   ")).toBe("");
  });
});

describe("validateNewTag", () => {
  const taken = collectTakenTagKeys(["效率工具"]);

  it("accepts a fresh label and answers its key", () => {
    expect(validateNewTag(" 翻译校对 ", taken)).toEqual({
      ok: true,
      key: "翻译校对",
    });
  });

  it("rejects empty and overlong labels", () => {
    expect(validateNewTag("   ", taken)).toEqual({
      ok: false,
      error: "empty",
    });
    expect(validateNewTag("x".repeat(33), taken)).toEqual({
      ok: false,
      error: "tooLong",
    });
    expect(validateNewTag("x".repeat(32), taken).ok).toBe(true);
  });

  it("reserves system keys case-insensitively, whatever the taken set holds", () => {
    expect(validateNewTag("Development", new Set())).toEqual({
      ok: false,
      error: "reserved",
    });
    expect(validateNewTag("unclassified", new Set())).toEqual({
      ok: false,
      error: "reserved",
    });
    expect(validateNewTag("ALL", new Set())).toEqual({
      ok: false,
      error: "reserved",
    });
    // A system key reads as reserved even when also present in the taken set.
    expect(validateNewTag("development", taken)).toEqual({
      ok: false,
      error: "reserved",
    });
  });

  it("rejects a duplicate custom key case-insensitively", () => {
    expect(validateNewTag("效率工具", taken)).toEqual({
      ok: false,
      error: "duplicate",
    });
  });
});

describe("defaultTagMark", () => {
  it("reads the label's first character, uppercasing a latin initial", () => {
    expect(defaultTagMark("效率工具")).toBe("效");
    expect(defaultTagMark(" my tag ")).toBe("M");
    expect(defaultTagMark("K")).toBe("K");
    expect(defaultTagMark("   ")).toBe("🏷️");
  });
});

describe("customTagMeta", () => {
  it("wears the label's first character and names it in both locales", () => {
    const meta = customTagMeta("效率工具", "效率工具");
    expect(meta.emoji).toBe("效");
    expect(meta.name.en).toBe("效率工具");
    expect(meta.name.zh).toBe("效率工具");
  });

  it("uppercases a lowercase latin initial, like an avatar", () => {
    expect(customTagMeta("my-tag", "my tag").emoji).toBe("M");
    expect(customTagMeta("k", "K", "🌟").emoji).toBe("🌟");
  });
});

describe("normalizeTagEmoji", () => {
  it("answers empty as the label's first character", () => {
    expect(normalizeTagEmoji("   ")).toEqual({ ok: true });
  });

  it("keeps one visible character — a ZWJ family counts as one", () => {
    expect(normalizeTagEmoji("🌟")).toEqual({ ok: true, emoji: "🌟" });
    expect(normalizeTagEmoji("👨‍👩‍👧‍👦")).toEqual({ ok: true, emoji: "👨‍👩‍👧‍👦" });
    expect(normalizeTagEmoji("🌟🚀")).toEqual({
      ok: false,
      error: "emojiLong",
    });
  });
});

describe("effectiveDomains", () => {
  const stored = { profile: { domain: ["development"] } };

  it("reads the store's classification when nothing is chosen", () => {
    expect(effectiveDomains(stored, null)).toEqual(["development"]);
    expect(effectiveDomains(stored, undefined)).toEqual(["development"]);
    expect(effectiveDomains({}, null)).toEqual([UNCLASSIFIED_DOMAIN]);
  });

  it("reads the single choice ahead of the store's answer", () => {
    expect(effectiveDomains(stored, "效率工具")).toEqual(["效率工具"]);
    expect(effectiveDomains({}, "testing")).toEqual(["testing"]);
  });

  it("agrees with domainsOf whenever there is no choice", () => {
    expect(effectiveDomains(stored)).toEqual(domainsOf(stored));
    expect(domainMeta(UNCLASSIFIED_DOMAIN)).toBeDefined();
  });
});
