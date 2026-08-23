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

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function ok() {
  return { ok: true, status: 200, text: async () => "body" } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("installSkillFromSource", () => {
  it("resolves a reachable SKILL.md URL and installs only that skill (Tauri)", async () => {
    isTauri.mockReturnValue(true);
    fetchMock.mockResolvedValue(ok());

    await installSkillFromSource("anthropics/skills", "pdf", "skills/pdf");

    expect(installSkill).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/anthropics/skills/HEAD/skills/pdf/SKILL.md",
      { global: true, skills: ["pdf"] },
    );
  });

  it("defaults the skill directory to the skill name when no path is given", async () => {
    isTauri.mockReturnValue(true);
    fetchMock.mockResolvedValue(ok());

    await installSkillFromSource("anthropics/skills", "pdf");

    expect(installSkill).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/anthropics/skills/HEAD/pdf/SKILL.md",
      { global: true, skills: ["pdf"] },
    );
  });

  it("records the install in the mock store outside Tauri", async () => {
    isTauri.mockReturnValue(false);

    await installSkillFromSource("anthropics/skills", "pdf");

    expect(installMockSkill).toHaveBeenCalledWith("anthropics/skills", "pdf");
    expect(installSkill).not.toHaveBeenCalled();
  });
});