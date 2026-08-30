import { describe, it, expect } from "vitest";

import { createSkillSearch } from "./search-skills";
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
  },
  {
    name: "deploy-scripts",
    repo: "acme/redis-toolkit",
    description: "Deployment automation for servers.",
    stars: 10,
  },
  {
    name: "doc-writer",
    repo: "acme/docs",
    description: "Generates docs that mention redis.",
    stars: 10,
  },
];

describe("createSkillSearch", () => {
  it("ranks matches by field priority: name above repo above description", () => {
    const results = createSkillSearch(skills)("redis");

    expect(results.map(({ skill }) => skill.name)).toEqual([
      "redis-cache-helper",
      "deploy-scripts",
      "doc-writer",
    ]);
  });

  it("ranks equally relevant matches by star count", () => {
    // Both skills match "redis" in their name with the same token shape, so
    // the relevance scores are identical and popularity decides the order.
    const results = createSkillSearch([
      {
        name: "alpha-redis-tool",
        repo: "acme/alpha",
        description: "Utilities.",
        stars: 5_000_000,
      },
      {
        name: "beta-redis-clip",
        repo: "acme/beta",
        description: "Utilities.",
        stars: 10,
      },
    ])("redis");

    expect(results.map(({ skill }) => skill.name)).toEqual([
      "alpha-redis-tool",
      "beta-redis-clip",
    ]);
  });

  it("keeps match quality ahead of popularity across field tiers", () => {
    // Popularity may cross one priority tier (repo match over name match)
    // but never two: even a maximal-star description match loses to a
    // zero-star name match.
    const results = createSkillSearch([
      {
        name: "redis-cache-helper",
        repo: "acme/other-tools",
        description: "Keeps your cache warm.",
        stars: 0,
      },
      {
        name: "doc-writer",
        repo: "acme/docs",
        description: "Generates docs that mention redis.",
        stars: 5_000_000,
      },
    ])("redis");

    expect(results[0].skill.name).toBe("redis-cache-helper");
  });

  it("reports the expanded matched terms per field for highlighting", () => {
    const [hit] = createSkillSearch(skills)("redi");

    // The prefix query "redi" reports the full indexed term "redis".
    expect(hit.skill.name).toBe("redis-cache-helper");
    expect(hit.matched.name).toEqual(["redis"]);
    expect(hit.matched.repo).toBeUndefined();
    expect(hit.matched.description).toBeUndefined();
  });

  it("reports matches from every field the term appears in", () => {
    const hit = createSkillSearch(skills)("cache").find(
      ({ skill }) => skill.name === "redis-cache-helper",
    );

    // "cache" appears in both the name and the description.
    expect(hit?.matched.name).toEqual(["cache"]);
    expect(hit?.matched.description).toEqual(["cache"]);
    expect(hit?.matched.repo).toBeUndefined();
  });

  it("still finds a skill when the query has a typo or is a prefix", () => {
    const search = createSkillSearch(skills);

    expect(search("redix").map(({ skill }) => skill.name)).toContain(
      "redis-cache-helper",
    );
    expect(search("redi").map(({ skill }) => skill.name)).toContain(
      "redis-cache-helper",
    );
  });

  it("returns nothing for text unrelated to the registry", () => {
    expect(createSkillSearch(skills)("kubernetes")).toEqual([]);
  });

  it("reuses the built index for the same data and rebuilds for new data", () => {
    // Route switches remount the page; the same array must yield the same
    // cached search, while a fresh fetch (new array) rebuilds.
    const first = createSkillSearch(skills);
    expect(createSkillSearch(skills)).toBe(first);
    expect(createSkillSearch([...skills])).not.toBe(first);
  });
});
