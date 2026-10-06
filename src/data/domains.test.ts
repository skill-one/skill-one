import { describe, expect, it } from "vitest";

import {
  DOMAINS,
  UNCLASSIFIED_DOMAIN,
  domainEmoji,
  domainLabel,
  domainMeta,
  domainTooltip,
  fullTagEmoji,
  isSystemDomain,
  registerCustomTagMeta,
} from "./domains";

/**
 * A skill's classification has three states, and the taxonomy's whole job here
 * is to keep two of them apart: a real domain, the dataset's own 其他 (an
 * answer — "none of the above fit"), and the blank nothing filled in (a
 * question). The first two are upstream values and live in `DOMAINS`; the third
 * is the app's own, so no upstream value can ever mean "nobody classified this".
 */
describe("the domain taxonomy's three states", () => {
  it("marks 其他 with the leftovers box, never with the question mark", () => {
    expect(domainMeta("other")?.name.zh).toBe("其他");
    expect(domainEmoji(["other"])).toBe("📦");
    // The question mark belongs to the unknown state alone: a real domain wearing
    // it would make an answer read like a blank in a list's glyph column.
    expect(DOMAINS.some((domain) => domain.emoji === "❓")).toBe(false);
    // And no two domains share an emoji, for the same reason one dimension over.
    expect(new Set(DOMAINS.map((domain) => domain.emoji)).size).toBe(
      DOMAINS.length,
    );
  });

  it("resolves the unclassified state without it being an upstream key", () => {
    expect(DOMAINS.map((domain) => domain.key)).not.toContain(
      UNCLASSIFIED_DOMAIN,
    );
    expect(domainMeta(UNCLASSIFIED_DOMAIN)?.name.zh).toBe("未分类");
    expect(domainMeta("未分类")?.key).toBe(UNCLASSIFIED_DOMAIN);
    expect(domainLabel(UNCLASSIFIED_DOMAIN, "zh")).toBe("未分类");
  });

  it("answers empty emoji for a skill nothing classified, omitting the ? mark", () => {
    // No profile at all, an empty list, and a key this build does not know are
    // unclassified: no ? emoji is rendered.
    expect(domainEmoji(undefined)).toBe("");
    expect(domainEmoji([])).toBe("");
    expect(domainEmoji(["future-domain"])).toBe("");
    expect(fullTagEmoji(UNCLASSIFIED_DOMAIN)).toBe("");
    const blank = domainMeta(UNCLASSIFIED_DOMAIN)?.description.zh;
    // The tip carries the scope text, not the emoji the tip itself hangs off.
    expect(domainTooltip([], "zh")).toBe(blank);
    expect(domainTooltip(["future-domain"], "zh")).toBe(blank);
  });

  it("distinguishes store predefined tags from custom and unclassified tags for fullTagEmoji", () => {
    expect(isSystemDomain("development")).toBe(true);
    expect(isSystemDomain("office-productivity")).toBe(true);
    expect(isSystemDomain("other")).toBe(true);
    expect(isSystemDomain("my-custom-tag")).toBe(false);
    expect(isSystemDomain(UNCLASSIFIED_DOMAIN)).toBe(false);

    expect(fullTagEmoji("development")).toBe("💻");
    expect(fullTagEmoji("office-productivity")).toBe("🗂️");
    expect(fullTagEmoji("other")).toBe("📦");
    expect(fullTagEmoji("my-custom-tag")).toBe("");
    expect(fullTagEmoji(UNCLASSIFIED_DOMAIN)).toBe("");
  });

  it("names the other domains beside the leading one", () => {
    expect(domainEmoji(["development", "testing"])).toBe("💻");
    expect(domainTooltip(["development", "testing"], "zh")).toContain(
      "同时属于：测试与质量",
    );
    // The unclassified state is never one of several: it stands for a skill with
    // no classification at all.
    expect(domainTooltip([UNCLASSIFIED_DOMAIN], "zh")).toBe(
      domainMeta(UNCLASSIFIED_DOMAIN)?.description.zh,
    );
  });
});

describe("the domain taxonomy in English", () => {
  it("labels the dataset domains and the unclassified state", () => {
    expect(domainMeta("development")?.name.en).toBe("Development");
    expect(domainMeta("other")?.name.en).toBe("Other");
    expect(domainMeta(UNCLASSIFIED_DOMAIN)?.name.en).toBe("Unclassified");
    expect(domainLabel("development", "en")).toBe("Development");
    expect(domainLabel(UNCLASSIFIED_DOMAIN, "en")).toBe("Unclassified");
  });

  it("resolves a meta by its English name", () => {
    expect(domainMeta("Testing & Quality")?.key).toBe("testing");
    expect(domainMeta("Unclassified")?.key).toBe(UNCLASSIFIED_DOMAIN);
  });

  it("names the other domains beside the leading one", () => {
    expect(domainTooltip(["development", "testing"], "en")).toContain(
      "also: Testing & Quality",
    );
    expect(domainTooltip([UNCLASSIFIED_DOMAIN], "en")).toBe(
      domainMeta(UNCLASSIFIED_DOMAIN)?.description.en,
    );
  });

  it("ships a non-empty description for every domain in both locales", () => {
    for (const domain of DOMAINS) {
      expect(domain.description.en.trim().length).toBeGreaterThan(0);
      expect(domain.description.zh.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("user tag registration", () => {
  // Registration is additive and global: the key below is unique to this
  // block so no other test can observe it, in either direction.
  const KEY = "test-registration-tag-xyz";
  const LABEL = "Test Registration Tag";

  it("resolves a registered tag through every domain surface", () => {
    expect(domainMeta(KEY)).toBeUndefined();
    registerCustomTagMeta({
      key: KEY,
      name: { en: LABEL, zh: LABEL },
      emoji: "🏷️",
      description: { en: LABEL, zh: LABEL },
    });    expect(domainMeta(KEY)?.name.zh).toBe(LABEL);
    expect(domainLabel(KEY, "zh")).toBe(LABEL);
    expect(domainEmoji([KEY])).toBe("🏷️");
    expect(domainTooltip([KEY], "en")).toBe(LABEL);
  });

  it("never overwrites the static taxonomy, but lets a tag evolve", () => {
    const before = domainMeta("development");
    registerCustomTagMeta({
      key: "development",
      name: { en: "Hijack", zh: "Hijack" },
      emoji: "🏷️",
      description: { en: "Hijack", zh: "Hijack" },
    });
    expect(domainMeta("development")).toBe(before);
    expect(domainLabel("development", "en")).toBe("Development");
    // Re-registering our own key updates it — a label or mark the user
    // changed — and drops the old spelling's lookup.
    registerCustomTagMeta({
      key: KEY,
      name: { en: "Renamed Label", zh: "Renamed Label" },
      emoji: "🌟",
      description: { en: "Renamed Label", zh: "Renamed Label" },
    });
    expect(domainLabel(KEY, "en")).toBe("Renamed Label");
    expect(domainEmoji([KEY])).toBe("🌟");
    expect(domainMeta(LABEL)).toBeUndefined();
  });
});
