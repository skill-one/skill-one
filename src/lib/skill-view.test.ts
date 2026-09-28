import { describe, it, expect } from "vitest";

import type { InstalledSkill } from "./skills-manager";
import type { Skill } from "../types/skill";
import { installedSkillView, translationFreshness } from "./skill-view";

/** One entry of the installed list, as the backend reports it. */
const installedPdf: InstalledSkill = {
  name: "pdf",
  enabled: true,
  description: "Read and merge PDF documents.",
};

/** The registry entry the ledger's source resolves to. */
const entry: Skill = {
  name: "pdf",
  repo: "anthropics/skills",
  description: "Read and merge PDF documents.",
  stars: 169600,
  downloads: 2991984,
  path: "skills/anthropics/skills/pdf",
  url: "https://www.skills.sh/anthropics/skills/pdf",
  rev: "rev-current",
};

const REV_INSTALL = "rev-at-install";

describe("translationFreshness", () => {
  it("reports fresh when the installed rev matches the registry's", () => {
    expect(translationFreshness(REV_INSTALL, REV_INSTALL)).toBe("fresh");
  });

  it("reports stale when the registry has moved past the installed rev", () => {
    expect(translationFreshness(REV_INSTALL, "rev-current")).toBe("stale");
  });

  it("reports unknown when either side of the comparison is missing", () => {
    expect(translationFreshness(undefined, "rev-current")).toBe("unknown");
    expect(translationFreshness(REV_INSTALL, undefined)).toBe("unknown");
    expect(translationFreshness(undefined, undefined)).toBe("unknown");
  });
});

describe("installedSkillView", () => {
  it("keeps path undefined and carries the snapshot directory separately", () => {
    const view = installedSkillView(installedPdf, {}, entry);
    // `path` undefined is what makes the panel read the SKILL.md off disk —
    // the copy the user actually has.
    expect(view.path).toBeUndefined();
    expect(view.snapshotPath).toBe("skills/anthropics/skills/pdf");
  });

  it("derives the translation's freshness from the ledger hash and the entry rev", () => {
    const ledger = (hash?: string) => ({
      repo: entry.repo,
      installedAt: "2026-08-12T04:34:54Z",
      ...(hash ? { hash } : {}),
    });
    expect(
      installedSkillView(installedPdf, { pdf: ledger("rev-current") }, entry)
        .translationFreshness,
    ).toBe("fresh");
    expect(
      installedSkillView(installedPdf, { pdf: ledger("rev-old") }, entry)
        .translationFreshness,
    ).toBe("stale");
    // An association recorded before hashes existed cannot be checked.
    expect(
      installedSkillView(installedPdf, { pdf: ledger() }, entry)
        .translationFreshness,
    ).toBe("unknown");
  });

  it("carries no freshness when no store entry backs the skill", () => {
    const view = installedSkillView(installedPdf);
    expect(view.storeBacked).toBe(false);
    expect(view.translationFreshness).toBeUndefined();
    expect(view.snapshotPath).toBeUndefined();
  });
});
