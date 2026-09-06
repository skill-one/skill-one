import { describe, expect, it } from "vitest";

import { parseSkillLine } from "./parse";

/** One JSONL index line, with the identity fields filled in by default. */
function line(raw: Record<string, unknown>): string {
  return JSON.stringify({
    id: "anthropics/skills/pdf",
    installs: 100,
    description: "Work with PDFs.",
    ...raw,
  });
}

describe("parseSkillLine", () => {
  it("maps a full index line onto the app's skill model", () => {
    expect(
      parseSkillLine(
        line({
          stars: 4200,
          url: "https://www.skills.sh/anthropics/skills/pdf",
          hash: "b146008599c31057",
          fetchedAt: "2026-09-06T07:57:37.803Z",
        }),
      ),
    ).toEqual({
      name: "pdf",
      repo: "anthropics/skills",
      description: "Work with PDFs.",
      stars: 4200,
      downloads: 100,
      path: "skills/anthropics/skills/pdf",
      rev: "b146008599c31057",
      firstSeenAt: "2026-09-06T07:57:37.803Z",
      url: "https://www.skills.sh/anthropics/skills/pdf",
    });
  });

  it("returns null for blank lines and malformed JSON", () => {
    expect(parseSkillLine("")).toBeNull();
    expect(parseSkillLine("   \n  ")).toBeNull();
    expect(parseSkillLine("{not json")).toBeNull();
  });

  it("keeps only canonical three-segment ids", () => {
    expect(parseSkillLine(line({ id: "open.feishu.cn/tools/x" }))).toBeNull();
    expect(parseSkillLine(line({ id: "owner/repo" }))).toBeNull();
    expect(parseSkillLine(line({ id: "owner/repo/deep/nested" }))).toBeNull();
    expect(parseSkillLine(line({ id: "/no-owner/skill" }))).toBeNull();
    expect(parseSkillLine(line({ id: "owner//skill" }))).toBeNull();
  });

  it("rejects a dotted owner, which is a domain rather than a GitHub user", () => {
    expect(parseSkillLine(line({ id: "a.b/repo/skill" }))).toBeNull();
    // The dot rule is about the owner only: a dotted repo name is still a repo.
    expect(parseSkillLine(line({ id: "owner/re.po/skill" }))).not.toBeNull();
  });

  it("normalizes absent metrics instead of leaking undefined", () => {
    expect(
      parseSkillLine(line({ description: null, stars: null })),
    ).toMatchObject({
      description: "",
      stars: 0,
      rev: undefined,
      firstSeenAt: undefined,
      url: undefined,
    });
    expect(
      parseSkillLine(JSON.stringify({ id: "a/b/c" }))?.downloads,
    ).toBe(0);
  });

  it("derives the mirror path from the id and keeps the slug as the name", () => {
    const skill = parseSkillLine(line({ id: "vercel-labs/skills/find-skills" }));
    expect(skill?.name).toBe("find-skills");
    expect(skill?.repo).toBe("vercel-labs/skills");
    // The basename equals the skill name, so a locally installed copy still
    // matches its registry entry.
    expect(skill?.path?.split("/").pop()).toBe(skill?.name);
  });
});
