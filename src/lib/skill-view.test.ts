import { describe, it, expect } from "vitest";

import type { InstalledSkill } from "./skills-manager";
import type { Skill } from "../types/skill";
import { installedSkillView } from "./skill-view";

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
};

describe("installedSkillView", () => {
  it("keeps path undefined and carries the snapshot directory separately", () => {
    const view = installedSkillView(installedPdf, {}, entry);
    // `path` undefined is what makes the panel read the SKILL.md off disk —
    // the copy the user actually has.
    expect(view.path).toBeUndefined();
    expect(view.snapshotPath).toBe("skills/anthropics/skills/pdf");
  });

  it("carries the registry entry's facts an on-disk record never has", () => {
    const view = installedSkillView(installedPdf, {}, entry);
    expect(view.storeBacked).toBe(true);
    expect(view.stars).toBe(169600);
    expect(view.downloads).toBe(2991984);
  });

  it("carries no store backing without a resolved entry", () => {
    const view = installedSkillView(installedPdf);
    expect(view.storeBacked).toBe(false);
    expect(view.snapshotPath).toBeUndefined();
  });
});
