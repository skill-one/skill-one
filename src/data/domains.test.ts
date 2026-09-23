import { describe, expect, it } from "vitest";

import {
  DOMAINS,
  UNCLASSIFIED_DOMAIN,
  domainEmoji,
  domainLabel,
  domainMeta,
  domainTooltip,
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
    expect(domainMeta("other")?.name).toBe("其他");
    expect(domainEmoji(["other"])).toBe("📦");
    // The unknown mark belongs to the unknown state alone: a real domain wearing
    // it would make an answer read like a blank in a list's glyph column.
    expect(DOMAINS.some((domain) => domain.emoji === "❓")).toBe(false);
    // And no two domains share a glyph, for the same reason one dimension over.
    expect(new Set(DOMAINS.map((domain) => domain.emoji)).size).toBe(
      DOMAINS.length,
    );
  });

  it("resolves the unclassified state without it being an upstream key", () => {
    expect(DOMAINS.map((domain) => domain.key)).not.toContain(
      UNCLASSIFIED_DOMAIN,
    );
    expect(domainMeta(UNCLASSIFIED_DOMAIN)?.name).toBe("未分类");
    expect(domainMeta("未分类")?.key).toBe(UNCLASSIFIED_DOMAIN);
    expect(domainLabel(UNCLASSIFIED_DOMAIN)).toBe("未分类");
  });

  it("answers for a skill nothing classified, whatever left it blank", () => {
    // No profile at all, an empty list, and a key this build does not know are
    // one state: nobody classified the skill.
    expect(domainEmoji(undefined)).toBe("❓");
    expect(domainEmoji([])).toBe("❓");
    expect(domainEmoji(["future-domain"])).toBe("❓");
    expect(domainTooltip([])).toMatch(/^❓ /);
    expect(domainTooltip(["future-domain"])).toMatch(/^❓ /);
  });

  it("names the other domains beside the leading one", () => {
    expect(domainEmoji(["development", "testing"])).toBe("💻");
    expect(domainTooltip(["development", "testing"])).toContain(
      "同时属于：测试与质量",
    );
    // The unclassified state is never one of several: it stands for a skill with
    // no classification at all.
    expect(domainTooltip([UNCLASSIFIED_DOMAIN])).toMatch(/^❓ /);
  });
});
