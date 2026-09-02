import { describe, expect, it } from "vitest";

import { parseSkillLine } from "./parse";

/** One JSONL index line, with the identity fields filled in by default. */
function line(raw: Record<string, unknown>): string {
  return JSON.stringify({
    source: "anthropics/skills",
    skillId: "pdf",
    installs: 100,
    description: "Work with PDFs.",
    path: "skills/pdf",
    ...raw,
  });
}

describe("parseSkillLine", () => {
  it("maps a full index line onto the app's skill model", () => {
    expect(
      parseSkillLine(
        line({ stars: 4200, weeklyInstalls: [1, 2, 7], rev: "t1-a4cf", firstSeenAt: "2026-08-12" }),
      ),
    ).toEqual({
      name: "pdf",
      repo: "anthropics/skills",
      description: "Work with PDFs.",
      stars: 4200,
      downloads: 100,
      weeklyInstalls: 7,
      path: "skills/pdf",
      rev: "t1-a4cf",
      firstSeenAt: "2026-08-12",
    });
  });

  it("returns null for blank lines and malformed JSON", () => {
    expect(parseSkillLine("")).toBeNull();
    expect(parseSkillLine("   \n  ")).toBeNull();
    expect(parseSkillLine("{not json")).toBeNull();
  });

  it("keeps only two-segment GitHub repos", () => {
    expect(parseSkillLine(line({ source: "open.feishu.cn/skills" }))).toBeNull();
    expect(parseSkillLine(line({ source: "someone/one/segment" }))).toBeNull();
    expect(parseSkillLine(line({ source: "/no-owner" }))).toBeNull();
    expect(parseSkillLine(line({ source: "no-repo/" }))).toBeNull();
  });

  it("rejects a dotted owner, which is a domain rather than a GitHub user", () => {
    expect(parseSkillLine(line({ source: "a.b/repo" }))).toBeNull();
    // The dot rule is about the owner only: a dotted repo name is still a repo.
    expect(parseSkillLine(line({ source: "owner/re.po" }))).not.toBeNull();
  });

  it("falls back to the skill id when the entry carries no name", () => {
    expect(parseSkillLine(line({ name: "Docu" }))?.name).toBe("Docu");
    expect(parseSkillLine(line({}))?.name).toBe("pdf");
  });

  it("normalizes absent metrics instead of leaking undefined", () => {
    expect(
      parseSkillLine(
        JSON.stringify({ source: "a/b", skillId: "s", installs: 5 }),
      ),
    ).toMatchObject({ description: "", stars: 0, weeklyInstalls: undefined });
    expect(
      parseSkillLine(JSON.stringify({ source: "a/b", skillId: "s" }))?.downloads,
    ).toBe(0);
  });

  it("reads the most recent week of a chronological install series", () => {
    const at = (weeklyInstalls: number[]) =>
      parseSkillLine(line({ weeklyInstalls }))?.weeklyInstalls;
    expect(at([3])).toBe(3);
    expect(at([3, 5, 4])).toBe(4);
    // An empty series means "no data", not zero installs.
    expect(at([])).toBeUndefined();
  });
});
