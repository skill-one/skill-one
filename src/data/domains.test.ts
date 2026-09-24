import { CircleHelp, Code, Shapes } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  DOMAINS,
  UNCLASSIFIED_DOMAIN,
  domainIcon,
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
  it("marks 其他 with the mixed shapes, never with the help icon", () => {
    expect(domainMeta("other")?.name.zh).toBe("其他");
    expect(domainIcon(["other"])).toBe(Shapes);
    // The unknown mark belongs to the unknown state alone: a real domain wearing
    // it would make an answer read like a blank in a list's glyph column.
    expect(DOMAINS.some((domain) => domain.icon === CircleHelp)).toBe(false);
    // And no two domains share a glyph, for the same reason one dimension over.
    expect(new Set(DOMAINS.map((domain) => domain.icon)).size).toBe(
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

  it("answers for a skill nothing classified, whatever left it blank", () => {
    // No profile at all, an empty list, and a key this build does not know are
    // one state: nobody classified the skill.
    expect(domainIcon(undefined)).toBe(CircleHelp);
    expect(domainIcon([])).toBe(CircleHelp);
    expect(domainIcon(["future-domain"])).toBe(CircleHelp);
    const blank = domainMeta(UNCLASSIFIED_DOMAIN)?.description.zh;
    // The tip carries the scope text, not the glyph the tip itself hangs off.
    expect(domainTooltip([], "zh")).toBe(blank);
    expect(domainTooltip(["future-domain"], "zh")).toBe(blank);
  });

  it("names the other domains beside the leading one", () => {
    expect(domainIcon(["development", "testing"])).toBe(Code);
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
