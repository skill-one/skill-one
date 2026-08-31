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
    // Popularity may cross one priority tier (repo match over name match)
    // but never two: even a maximal-install description match loses to a
    // zero-install name match.
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
});
