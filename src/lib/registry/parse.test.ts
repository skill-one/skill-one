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

/** The stars join, as readRepos' parsed repos.jsonl rows would answer. */
const starsFor = (repo: string) =>
  repo === "anthropics/skills" ? 4200 : undefined;

describe("parseSkillLine", () => {
  it("maps a full index line onto the app's skill model", () => {
    expect(
      parseSkillLine(
        line({
          name: "pdf",
          dir: "anthropics/skills/pdf",
          description_zh: "处理 PDF。",
          domain: "development",
          confidence: 0.9,
        }),
        starsFor,
      ),
    ).toEqual({
      name: "pdf",
      id: "anthropics/skills/pdf",
      repo: "anthropics/skills",
      description: "Work with PDFs.",
      descriptionZh: "处理 PDF。",
      stars: 4200,
      downloads: 100,
      path: "skills/anthropics/skills/pdf",
      url: "https://www.skills.sh/anthropics/skills/pdf",
      profile: { domain: ["development"], confidence: 0.9 },
    });
  });

  it("maps the Chinese description when the line provides one", () => {
    expect(
      parseSkillLine(line({ description_zh: "处理 PDF。" })),
    ).toMatchObject({
      description: "Work with PDFs.",
      descriptionZh: "处理 PDF。",
    });
  });

  it("carries no Chinese description when the line omits it", () => {
    expect(parseSkillLine(line({}))?.descriptionZh).toBeUndefined();
    expect(
      parseSkillLine(line({ description_zh: null }))?.descriptionZh,
    ).toBeUndefined();
  });

  it("joins stars by the id's repo, not the skill", () => {
    // Sibling skills of the same repo share one stars row.
    expect(
      parseSkillLine(line({ id: "anthropics/skills/docx" }), starsFor)?.stars,
    ).toBe(4200);
    // A repo with no row in repos.jsonl normalizes to 0.
    expect(
      parseSkillLine(line({ id: "acme/tools/hammer" }), starsFor)?.stars,
    ).toBe(0);
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
    expect(parseSkillLine(line({ description: null }))).toMatchObject({
      description: "",
      stars: 0,
    });
    expect(
      parseSkillLine(JSON.stringify({ id: "a/b/c" }))?.downloads,
    ).toBe(0);
  });

  it("prefers the row's dir for the mirror path and the id's slug for the name", () => {
    // `dir` is the row's own spelling of where its files live and can differ
    // from the id. The name is the id's slug — the skills.sh identity — even
    // when the mirror spells the frontmatter `name` with casing the slug
    // folds away, so it always matches what a local install is called.
    const skill = parseSkillLine(
      line({
        id: "vercel-labs/skills/find-skills",
        name: "Find Skills",
        dir: "vercel-labs/skills/find-skills",
      }),
    );
    expect(skill?.name).toBe("find-skills");
    // The raw frontmatter spelling rides along as the display name, since it
    // folds to a different string than the slug.
    expect(skill?.displayName).toBe("Find Skills");
    expect(skill?.repo).toBe("vercel-labs/skills");
    expect(skill?.path).toBe("skills/vercel-labs/skills/find-skills");
  });

  it("carries no display name when the frontmatter name folds to the slug", () => {
    expect(parseSkillLine(line({ name: "pdf" }))?.displayName).toBeUndefined();
    expect(parseSkillLine(line({}))?.displayName).toBeUndefined();
  });

  it("falls back to the id for path and slug for name when the row omits them", () => {
    const skill = parseSkillLine(JSON.stringify({ id: "a/b/c", installs: 1 }));
    expect(skill?.name).toBe("c");
    expect(skill?.path).toBe("skills/a/b/c");
  });

  it("derives the skills.sh page url from the id", () => {
    expect(parseSkillLine(line({}))?.url).toBe(
      "https://www.skills.sh/anthropics/skills/pdf",
    );
  });

  it("wraps the single upstream key as the model's one-element list", () => {
    // Upstream answers one closed category per skill; the model keeps a list
    // so grouping and filtering can match by membership.
    expect(parseSkillLine(line({ domain: "development" }))?.profile).toEqual({
      domain: ["development"],
    });
  });

  it("carries the classifier's confidence when the row states one", () => {
    expect(parseSkillLine(line({ domain: "development", confidence: 0.8 }))?.profile)
      .toEqual({ domain: ["development"], confidence: 0.8 });
    // Null (the classifier did not say) is simply omitted.
    expect(parseSkillLine(line({ domain: "development", confidence: null }))?.profile)
      .toEqual({ domain: ["development"] });
  });

  it("carries no profile for a skill the generator has not classified", () => {
    for (const domain of [undefined, null, "", [], ["development", ""], 7, {}]) {
      expect(parseSkillLine(line({ domain }))?.profile).toBeUndefined();
    }
  });
});
