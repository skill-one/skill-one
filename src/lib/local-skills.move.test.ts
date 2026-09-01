import { describe, it, expect, beforeEach } from "vitest";

import { moveSkill } from "./local-skills";
import {
  getMockSkillsInScope,
  resetMockInstalledSkills,
  addMockLocalSkill,
} from "./mock-local";
import { GLOBAL_SCOPE, projectScope, type SkillScope } from "./skill-scope";
import type { InstalledSkill } from "./skills-manager";

const PROJECT = "/p/app";
const projScope: SkillScope = projectScope(PROJECT);

/** A raw (un-merged) skill as the backend would report it for a scope. */
function skill(
  name: string,
  scope: "global" | "project",
  path: string,
  source: string | null = "some/repo",
): InstalledSkill {
  return {
    name,
    path,
    scope,
    agents: [],
    source,
    sourceUrl: null,
    sourceType: source ? "github" : null,
    enabled: true,
  };
}

// This file exercises the browser (non-Tauri) branch, which routes through the
// real mock store seeded by resetMockInstalledSkills().
beforeEach(() => resetMockInstalledSkills());

describe("moveSkill (mock browser path)", () => {
  it("is a no-op when already in the target scope", async () => {
    const globalPdf = skill("pdf", "global", "~/.agents/skills/pdf");
    const before = getMockSkillsInScope(GLOBAL_SCOPE).length;
    await moveSkill(globalPdf, GLOBAL_SCOPE);
    expect(getMockSkillsInScope(GLOBAL_SCOPE)).toHaveLength(before);
  });

  it("moves a global skill into a project and back out", async () => {
    const globalPdf = skill("pdf", "global", "~/.agents/skills/pdf");

    await moveSkill(globalPdf, projScope);
    expect(
      getMockSkillsInScope(GLOBAL_SCOPE).find((s) => s.name === "pdf"),
    ).toBeUndefined();
    expect(
      getMockSkillsInScope(projScope).find((s) => s.name === "pdf"),
    ).toBeDefined();

    // Round-trip: the moved row now reports a project path, so moving it back
    // to global recovers the original placement.
    const projectPdf = skill("pdf", "project", `${PROJECT}/.agents/skills/pdf`);
    await moveSkill(projectPdf, GLOBAL_SCOPE);
    expect(
      getMockSkillsInScope(GLOBAL_SCOPE).find((s) => s.name === "pdf"),
    ).toBeDefined();
    expect(
      getMockSkillsInScope(projScope).find((s) => s.name === "pdf"),
    ).toBeUndefined();
  });

  it("rejects moving into a project that already holds the same name", async () => {
    addMockLocalSkill("dup", GLOBAL_SCOPE);
    addMockLocalSkill("dup", projScope);

    const globalDup = skill("dup", "global", "~/.agents/skills/dup", null);
    await expect(moveSkill(globalDup, projScope)).rejects.toThrow(
      "目标项目已存在同名技能",
    );
    // The rejected move leaves the original copy untouched.
    expect(
      getMockSkillsInScope(GLOBAL_SCOPE).find((s) => s.name === "dup"),
    ).toBeDefined();
  });
});
