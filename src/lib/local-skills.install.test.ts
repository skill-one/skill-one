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
    installSkill.mockResolvedValue({
      listOnly: false,
      installed: [{ name: "pdf", canonicalPath: "~/.agents/skills/pdf" }],
      failed: [],
      discovered: ["pdf"],
    });

    await installSkillFromSource("anthropics/skills", "pdf");

    expect(installSkill).toHaveBeenCalledWith("anthropics/skills", {
      global: true,
      skills: ["pdf"],
    });
  });

  it("throws the backend failure when the install reports an error", async () => {
    isTauri.mockReturnValue(true);
    installSkill.mockResolvedValue({
      listOnly: false,
      installed: [],
      failed: [{ skill: "pdf", error: "clone failed: network unreachable" }],
      discovered: ["pdf"],
    });

    await expect(
      installSkillFromSource("anthropics/skills", "pdf"),
    ).rejects.toThrow("clone failed: network unreachable");
  });

  it("throws when the named skill is not found in the source repo", async () => {
    isTauri.mockReturnValue(true);
    installSkill.mockResolvedValue({
      listOnly: false,
      installed: [],
      failed: [],
      discovered: [],
    });

    await expect(
      installSkillFromSource("anthropics/skills", "missing"),
    ).rejects.toThrow("未在 anthropics/skills 中找到可安装的技能 missing");
  });

  it("records the install in the mock store outside Tauri", async () => {
    isTauri.mockReturnValue(false);

    await installSkillFromSource("anthropics/skills", "pdf");

    expect(installMockSkill).toHaveBeenCalledWith("anthropics/skills", "pdf");
    expect(installSkill).not.toHaveBeenCalled();
  });
});