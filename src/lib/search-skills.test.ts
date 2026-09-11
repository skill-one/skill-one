import { describe, it, expect } from "vitest";

import { buildSkillSearch } from "./search-skills";
import type { Skill } from "../types/skill";

// "redis" appears verbatim in exactly one field of each skill — name, repo
// and description respectively — so the ranking between them is decided by
// the field boosts alone.
const skills: Skill[] = [
  {
    name: "redis-cache-helper",
    repo: "acme/other-tools",
    description: "Keeps your cache warm.",
    stars: 10,
    downloads: 10,
  },
  {
    name: "deploy-scripts",
    repo: "acme/redis-toolkit",
    description: "Deployment automation for servers.",
    stars: 10,
    downloads: 10,
  },
  {
    name: "doc-writer",
    repo: "acme/docs",
    description: "Generates docs that mention redis.",
    stars: 10,
    downloads: 10,
  },
];

describe("buildSkillSearch", () => {
  it("ranks matches by field priority: name above repo above description", () => {
    const results = buildSkillSearch(skills)("redis");

    expect(results.map(({ skill }) => skill.name)).toEqual([
      "redis-cache-helper",
      "deploy-scripts",
      "doc-writer",
    ]);
  });

  it("ranks equally relevant matches by install count", () => {
    // Both skills match "redis" in their name with the same token shape, so
    // the relevance scores are identical and popularity decides the order.
    const results = buildSkillSearch([
      {
        name: "alpha-redis-tool",
        repo: "acme/alpha",
        description: "Utilities.",
        stars: 10,
        downloads: 5_000_000,
      },
      {
        name: "beta-redis-clip",
        repo: "acme/beta",
        description: "Utilities.",
        stars: 10,
        downloads: 10,
      },
    ])("redis");

    expect(results.map(({ skill }) => skill.name)).toEqual([
      "alpha-redis-tool",
      "beta-redis-clip",
    ]);
  });

  it("keeps match quality ahead of popularity across field tiers", () => {
    // A name hit outranks a description hit whatever the install counts: the
    // field ratio (8×) is wider than the popularity boost can close (max
    // ~2.2×), and the name tier orders it first regardless.
    const results = buildSkillSearch([
      {
        name: "redis-cache-helper",
        repo: "acme/other-tools",
        description: "Keeps your cache warm.",
        stars: 0,
        downloads: 0,
      },
      {
        name: "doc-writer",
        repo: "acme/docs",
        description: "Generates docs that mention redis.",
        stars: 5_000_000,
        downloads: 5_000_000,
      },
    ])("redis");

    expect(results[0].skill.name).toBe("redis-cache-helper");
  });

  it("reports the expanded matched terms per field for highlighting", () => {
    const [hit] = buildSkillSearch(skills)("redi");

    // The prefix query "redi" reports the full indexed term "redis".
    expect(hit.skill.name).toBe("redis-cache-helper");
    expect(hit.matched.name).toEqual(["redis"]);
    expect(hit.matched.repo).toBeUndefined();
    expect(hit.matched.description).toBeUndefined();
  });

  it("reports matches from every field the term appears in", () => {
    const hit = buildSkillSearch(skills)("cache").find(
      ({ skill }) => skill.name === "redis-cache-helper",
    );

    // "cache" appears in both the name and the description.
    expect(hit?.matched.name).toEqual(["cache"]);
    expect(hit?.matched.description).toEqual(["cache"]);
    expect(hit?.matched.repo).toBeUndefined();
  });

  it("still finds a skill when the query has a typo or is a prefix", () => {
    const search = buildSkillSearch(skills);

    expect(search("redix").map(({ skill }) => skill.name)).toContain(
      "redis-cache-helper",
    );
    expect(search("redi").map(({ skill }) => skill.name)).toContain(
      "redis-cache-helper",
    );
  });

  it("returns nothing for text unrelated to the registry", () => {
    expect(buildSkillSearch(skills)("kubernetes")).toEqual([]);
  });

  it("does not search a skill's profile domain", () => {
    // The profile domain is a filter, not a search field: only name, repo and
    // description are indexed.
    const profiled: Skill[] = [
      {
        name: "pdf-exporter",
        repo: "acme/docs",
        description: "Turns pages into PDFs.",
        stars: 10,
        downloads: 10,
        profile: { domain: "内容创作" },
      },
    ];

    expect(buildSkillSearch(profiled)("内容创作")).toEqual([]);
  });
});

describe("buildSkillSearch — query-level rules", () => {
  it("floats an exact name match above a far more popular mention", () => {
    const results = buildSkillSearch([
      {
        name: "pdf",
        repo: "acme/pdf",
        description: "Tiny.",
        stars: 0,
        downloads: 0,
      },
      {
        name: "pdf-exporter",
        repo: "acme/tools",
        description: "A pdf toolbox for pdf files.",
        stars: 5_000_000,
        downloads: 5_000_000,
      },
    ])("pdf");

    // Field stacking plus popularity would put the exporter first; the name
    // tier overrides both.
    expect(results.map(({ skill }) => skill.name)).toEqual([
      "pdf",
      "pdf-exporter",
    ]);
  });

  it("floats a name prefix above a non-prefix match, popularity aside", () => {
    const results = buildSkillSearch([
      {
        name: "pdf-tools",
        repo: "acme/pdf-tools",
        description: "Utilities.",
        stars: 0,
        downloads: 0,
      },
      {
        name: "mypdf",
        repo: "acme/mypdf",
        description: "A pdf suite with pdf helpers.",
        stars: 5_000_000,
        downloads: 5_000_000,
      },
    ])("pdf");

    expect(results.map(({ skill }) => skill.name)).toEqual([
      "pdf-tools",
      "mypdf",
    ]);
  });

  it("matches the name tier across separators and case", () => {
    const results = buildSkillSearch([
      {
        name: "pdf-exporter",
        repo: "acme/tools",
        description: "Turns pages into PDFs.",
        stars: 0,
        downloads: 0,
      },
      {
        name: "exporter-of-pdf",
        repo: "acme/other",
        description: "Also emits PDFs.",
        stars: 0,
        downloads: 0,
      },
    ])("PDF Exporter");

    // Both carry the terms; only the first one is the name, with separators
    // and case ignored.
    expect(results.map(({ skill }) => skill.name)).toEqual([
      "pdf-exporter",
      "exporter-of-pdf",
    ]);
  });

  it("requires every term before falling back to any of them", () => {
    const search = buildSkillSearch([
      {
        name: "redis-cache",
        repo: "acme/redis",
        description: "Caches redis reads.",
        stars: 0,
        downloads: 0,
      },
      {
        name: "redis-tool",
        repo: "acme/redis-tool",
        description: "Talks to redis.",
        stars: 5_000_000,
        downloads: 5_000_000,
      },
    ]);

    // Only one skill carries both terms, so the popular single-term match is
    // not returned at all.
    expect(search("redis cache").map(({ skill }) => skill.name)).toEqual([
      "redis-cache",
    ]);

    // No document carries both, so the query falls back to "any word" instead
    // of coming back empty.
    expect(search("redis kubernetes").map(({ skill }) => skill.name)).toContain(
      "redis-tool",
    );
  });

  it("lets popularity decide between namesakes despite a description mention", () => {
    // The reported case: several skills are all called "grill-me", some of them
    // repeat the word in their trigger-phrase description, and the by-far most
    // installed one does not. The description mention used to outweigh a 100×
    // install gap; the name tier plus the half-weighted description fix that.
    const results = buildSkillSearch([
      {
        name: "grill-me",
        repo: "acme/wrapper",
        description:
          'Interview the user relentlessly. Use when the user wants to get grilled on their design, or mentions "grill me".',
        stars: 5_400,
        downloads: 5_400,
      },
      {
        name: "grill-me",
        repo: "acme/original",
        description: "A relentless interview to sharpen a plan or design.",
        stars: 536_200,
        downloads: 536_200,
      },
    ])("grill");

    expect(results.map(({ skill }) => skill.repo)).toEqual([
      "acme/original",
      "acme/wrapper",
    ]);
  });

  it("keeps a second matching field as a tie-break, not a penalty", () => {
    // Two namesakes of equal popularity: the one whose description also carries
    // the term wins on relevance. A field-shadowing rule ("the name matched, so
    // drop the description score") would tie them instead.
    const results = buildSkillSearch([
      {
        name: "grill-me",
        repo: "acme/talkative",
        description: 'Say "grill me" to start.',
        stars: 100,
        downloads: 100,
      },
      {
        name: "grill-me",
        repo: "acme/terse",
        description: "A relentless interview.",
        stars: 100,
        downloads: 100,
      },
    ])("grill");

    expect(results.map(({ skill }) => skill.repo)).toEqual([
      "acme/talkative",
      "acme/terse",
    ]);
  });
});
