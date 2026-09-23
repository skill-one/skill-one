import { describe, expect, it } from "vitest";

import type { SkillView } from "../../lib/skill-view";

import { buildLiveRepoGroups } from "./live-groups";

/** One live hit in the shape the page's deduped answer holds. */
function live(name: string, repo: string, downloads: number): SkillView {
  return {
    name,
    repo,
    description: "",
    stars: 0,
    downloads,
    url: `https://www.skills.sh/${repo}/${name}`,
    storeBacked: false,
  };
}

describe("buildLiveRepoGroups", () => {
  it("buckets the flat answer by repository, endpoint order preserved", () => {
    const groups = buildLiveRepoGroups([
      live("a", "o/first", 3),
      live("b", "o/second", 2),
      live("c", "o/first", 1),
    ]);

    expect(groups.map((g) => g.title)).toEqual(["o/first", "o/second"]);
    expect(groups[0].skills.map((s) => s.name)).toEqual(["a", "c"]);
    expect(groups[1].skills.map((s) => s.name)).toEqual(["b"]);
  });

  it("namespaces group keys so they cannot collide with local groups", () => {
    const [group] = buildLiveRepoGroups([live("a", "o/first", 1)]);
    expect(group.key).toBe("live:o/first");
  });

  it("orders each bucket most-installed first, ties keep the endpoint order", () => {
    const groups = buildLiveRepoGroups([
      live("late", "o/one", 5),
      live("top", "o/one", 9),
      live("tied-b", "o/one", 3),
      live("tied-a", "o/one", 3),
    ]);

    expect(groups[0].skills.map((s) => s.name)).toEqual([
      "top",
      "late",
      "tied-b",
      "tied-a",
    ]);
  });

  it("answers an empty answer with no groups", () => {
    expect(buildLiveRepoGroups([])).toEqual([]);
  });
});
