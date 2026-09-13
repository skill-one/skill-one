import { describe, it, expect, vi, beforeEach } from "vitest";

import { removeInstalledSkill } from "./local-skills";

const {
  isTauri,
  removeSkills,
  removeMockSkill,
  removeSkillProvenance,
} = vi.hoisted(() => ({
  isTauri: vi.fn(),
  removeSkills: vi.fn(),
  removeMockSkill: vi.fn(),
  removeSkillProvenance: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({ removeSkills }));
vi.mock("./mock-local", () => ({ removeMockSkill }));
vi.mock("./provenance", () => ({ removeSkillProvenance }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeInstalledSkill provenance", () => {
  it("forgets the install source after a backend removal (Tauri)", async () => {
    isTauri.mockReturnValue(true);

    await removeInstalledSkill("pdf");

    expect(removeSkills).toHaveBeenCalledWith(["pdf"]);
    expect(removeSkillProvenance).toHaveBeenCalledWith("pdf");
  });

  it("forgets the install source after a mock removal (browser)", async () => {
    isTauri.mockReturnValue(false);

    await removeInstalledSkill("pdf");

    expect(removeMockSkill).toHaveBeenCalledWith("pdf");
    expect(removeSkillProvenance).toHaveBeenCalledWith("pdf");
  });
});
