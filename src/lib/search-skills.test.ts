import { describe, it, expect } from "vitest";

import { buildSkillSearch } from "./search-skills";
import type { Skill } from "../types/skill";

// Only the name is searched: "redis" sits in deploy-scripts' repo
// (acme/redis-toolkit) and in doc-writer's description, and neither is a hit —
// the one skill named for it is.
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
  it("searches the name only: a repo or description mention is not a hit", () => {
    const results = buildSkillSearch(skills)("redis");

    expect(results.map(({ skill }) => skill.name)).toEqual([
      "redis-cache-helper",
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

  it("reports the expanded name terms for highlighting", () => {
    const [hit] = buildSkillSearch(skills)("redi");

    // The prefix query "redi" reports the full indexed term "redis", and the
    // name is the only key a hit carries.
    expect(hit.skill.name).toBe("redis-cache-helper");
    expect(hit.matched).toEqual({ name: ["redis"] });
  });

  it("answers a half-typed word but not a mistyped one", () => {
    const search = buildSkillSearch(skills);

    // A prefix is an unfinished query, so it still answers.
    expect(search("redi").map(({ skill }) => skill.name)).toContain(
      "redis-cache-helper",
    );
    // A typo is a wrong term, and the shared index forgives nothing.
    expect(search("redix").map(({ skill }) => skill.name)).toEqual([]);
  });

  it("returns nothing for text unrelated to the registry", () => {
    expect(buildSkillSearch(skills)("kubernetes")).toEqual([]);
  });

  it("does not search a skill's profile domain", () => {
    // The profile domain is a filter, not a search field: only the name is
    // indexed.
    const profiled: Skill[] = [
      {
        name: "pdf-exporter",
        repo: "acme/docs",
        description: "Turns pages into PDFs.",
        stars: 10,
        downloads: 10,
        profile: { domain: ["content-creation"] },
      },
    ];

    expect(buildSkillSearch(profiled)("内容创作")).toEqual([]);
  });
});

describe("buildSkillSearch — query-level rules", () => {
  it("floats an exact name match above a far more popular longer name", () => {
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

    // Popularity would put the exporter first; the name tier overrides it.
    expect(results.map(({ skill }) => skill.name)).toEqual([
      "pdf",
      "pdf-exporter",
    ]);
  });

  it("floats a name prefix above a non-prefix name match, popularity aside", () => {
    const results = buildSkillSearch([
      {
        name: "pdf-tools",
        repo: "acme/pdf-tools",
        description: "Utilities.",
        stars: 0,
        downloads: 0,
      },
      {
        name: "suite-pdf",
        repo: "acme/suite",
        description: "A suite.",
        stars: 5_000_000,
        downloads: 5_000_000,
      },
    ])("pdf");

    expect(results.map(({ skill }) => skill.name)).toEqual([
      "pdf-tools",
      "suite-pdf",
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

  it("requires every query term to match", () => {
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

    // No document carries both, and there is no OR fallback, so the query is
    // empty rather than returning the redis-only match.
    expect(search("redis kubernetes")).toEqual([]);
  });

  it("lets popularity decide between namesakes", () => {
    // Several skills are all called "grill-me"; the by-far most installed one
    // wins.
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

  it("keeps the registry order between otherwise identical hits", () => {
    // Two namesakes of equal popularity with no other difference: the search
    // adds no tie-break of its own, so their registry order stands.
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
