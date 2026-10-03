import { describe, it, expect, vi, beforeEach } from "vitest";

import { removeInstalledSkill, removeInstalledSkills } from "./local-skills";

const {
  isTauri,
  removeSkills,
  removeMockSkill,
  removeSkillProvenanceBatch,
} = vi.hoisted(() => ({
  isTauri: vi.fn(),
  removeSkills: vi.fn(),
  removeMockSkill: vi.fn(),
  removeSkillProvenanceBatch: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({
  removeSkills,
  // The activity log's append path: a removal records an event, and the write
  // itself is not what this suite is about. Left out, `logActivity` throws
  // inside its own try/catch and only warns, so the omission would pass
  // silently while every removal stopped being logged.
  appendActivityRaw: vi.fn(),
}));
vi.mock("./mock-local", () => ({ removeMockSkill }));
vi.mock("./provenance", () => ({ removeSkillProvenanceBatch }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeInstalledSkills provenance", () => {
  it("forgets the install source after a backend removal (Tauri)", async () => {
    isTauri.mockReturnValue(true);

    await removeInstalledSkill("pdf");

    // One backend round trip for the whole list, one ledger pass for all of
    // the names — the batch removal of a repository is logically one update.
    expect(removeSkills).toHaveBeenCalledWith(["pdf"]);
    expect(removeSkillProvenanceBatch).toHaveBeenCalledWith(["pdf"]);
  });

  it("removes every mock skill and forgets their sources (browser)", async () => {
    isTauri.mockReturnValue(false);

    await removeInstalledSkills(["pdf", "docx"]);

    expect(removeMockSkill).toHaveBeenCalledWith("pdf");
    expect(removeMockSkill).toHaveBeenCalledWith("docx");
    expect(removeSkillProvenanceBatch).toHaveBeenCalledWith(["pdf", "docx"]);
  });
});
