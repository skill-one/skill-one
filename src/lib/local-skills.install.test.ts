import { describe, it, expect, vi, beforeEach } from "vitest";

import { installSkillFromSource } from "./local-skills";

const { isTauri, installSkill, installMockSkill } = vi.hoisted(() => ({
  isTauri: vi.fn(),
  installSkill: vi.fn(),
  installMockSkill: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({ installSkill }));
vi.mock("./mock-local", () => ({ installMockSkill }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("installSkillFromSource", () => {
  it("hands the owner/repo source to the backend's GitHub install (Tauri)", async () => {
    isTauri.mockReturnValue(true);

    await installSkillFromSource("anthropics/skills", "pdf");

    expect(installSkill).toHaveBeenCalledWith("anthropics/skills", {
      global: true,
      skills: ["pdf"],
    });
  });

  it("records the install in the mock store outside Tauri", async () => {
    isTauri.mockReturnValue(false);

    await installSkillFromSource("anthropics/skills", "pdf");

    expect(installMockSkill).toHaveBeenCalledWith("anthropics/skills", "pdf");
    expect(installSkill).not.toHaveBeenCalled();
  });
});