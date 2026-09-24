import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  fetchLocalSkillDetail,
  readLocalSkillRaw,
  saveLocalSkillMd,
} from "./local-skills";

const { isTauri, readSkillMd, writeSkillMd } = vi.hoisted(() => ({
  isTauri: vi.fn(),
  readSkillMd: vi.fn(),
  writeSkillMd: vi.fn(),
}));

vi.mock("./tauri", () => ({ isTauri }));
vi.mock("./skills-manager", () => ({ readSkillMd, writeSkillMd }));

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

    expect(detail.description).toBe(
      "PDF 文档读取、生成、合并、拆分与标注。",
    );
    expect(detail.instructions).toContain("演示数据");
    expect(detail.path).toBe("~/.agents/skills/pdf/SKILL.md");
  });

  it("rejects for a name the mock store does not have", async () => {
    isTauri.mockReturnValue(false);

    await expect(fetchLocalSkillDetail("ghost")).rejects.toThrow(
      "Skill ghost is not installed locally",
    );
  });
});

describe("readLocalSkillRaw", () => {
  it("reads the raw file through the backend (Tauri)", async () => {
    isTauri.mockReturnValue(true);
    readSkillMd.mockResolvedValue({
      path: "/Users/me/.agents/skills/pdf/SKILL.md",
      content: "---\nname: pdf\n---\nBODY",
    });

    await expect(readLocalSkillRaw("pdf")).resolves.toBe(
      "---\nname: pdf\n---\nBODY",
    );
    expect(readSkillMd).toHaveBeenCalledWith("pdf");
  });

  it("returns the mock store's raw text (browser)", async () => {
    isTauri.mockReturnValue(false);

    const text = await readLocalSkillRaw("pdf");

    // The synthesized document keeps the frontmatter, which a save must
    // round-trip; the rendered detail drops it.
    expect(text.startsWith("---\n")).toBe(true);
    expect(text).toContain("name: pdf");
  });
});

describe("saveLocalSkillMd", () => {
  it("writes the file through the backend (Tauri)", async () => {
    isTauri.mockReturnValue(true);
    writeSkillMd.mockResolvedValue(undefined);

    await saveLocalSkillMd("pdf", "next");

    expect(writeSkillMd).toHaveBeenCalledWith("pdf", "next");
  });

  it("records the text in the mock store (browser) so it reads back", async () => {
    isTauri.mockReturnValue(false);

    await saveLocalSkillMd("pdf", "browser edit");

    await expect(readLocalSkillRaw("pdf")).resolves.toBe("browser edit");
  });
});
