import { describe, it, expect, vi, beforeEach } from "vitest";

import { fetchLocalSkillDetail } from "./local-skills";

const { isTauri, readSkillMd } = vi.hoisted(() => ({
  isTauri: vi.fn(),
  readSkillMd: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({ readSkillMd }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchLocalSkillDetail", () => {
  it("parses the SKILL.md returned by the backend (Tauri)", async () => {
    isTauri.mockReturnValue(true);
    readSkillMd.mockResolvedValue({
      path: "/Users/me/.agents/skills/pdf/SKILL.md",
      content: "---\nname: pdf\ndescription: 读取 PDF。\nversion: 1.2\n---\nBODY",
    });

    const detail = await fetchLocalSkillDetail("pdf");

    expect(readSkillMd).toHaveBeenCalledWith("pdf");
    expect(detail).toMatchObject({
      name: "pdf",
      description: "读取 PDF。",
      instructions: "BODY",
      path: "/Users/me/.agents/skills/pdf/SKILL.md",
    });
    // The author-declared frontmatter version is deliberately not surfaced:
    // the registry's own content fingerprint is the version on display.
    expect(detail).not.toHaveProperty("version");
  });

  it("synthesizes a detail record from the mock store (browser)", async () => {
    isTauri.mockReturnValue(false);

    const detail = await fetchLocalSkillDetail("pdf");

    expect(detail.name).toBe("pdf");
    expect(detail.description).toBe(
      "PDF 文档读取、生成、合并、拆分与标注。",
    );
    expect(detail.instructions).toContain("演示数据");
    expect(detail.path).toBe("~/.agents/skills/pdf/SKILL.md");
  });

  it("rejects for a name the mock store does not have", async () => {
    isTauri.mockReturnValue(false);

    await expect(fetchLocalSkillDetail("ghost")).rejects.toThrow(
      "本地未安装技能 ghost",
    );
  });
});
