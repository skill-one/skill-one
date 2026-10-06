import { describe, it, expect } from "vitest";
import {
  starsOf,
  compareByStars,
  groupRowsByRepo,
  sortRepoGroups,
  sortSkillRows,
  buildRowOrdinals,
  type Row,
} from "./installed-grouping";
import type { SkillView } from "../../lib/skill-view";

function makeRow(
  name: string,
  repo: string,
  downloads: number,
  stars = 0,
  installedAt: number | null = null,
  enabled = true,
): Row {
  const skill: SkillView = {
    name,
    repo,
    description: "test description",
    downloads,
    stars,
    installedAt,
    storeBacked: Boolean(stars > 0),
  };
  return { skill, enabled };
}

describe("installed-grouping", () => {
  it("starsOf returns store-backed stars or undefined", () => {
    const r1 = makeRow("s1", "user/repo", 100, 50);
    const r2 = makeRow("s2", "user/repo", 200, 0);
    expect(starsOf({ repo: "user/repo", items: [r1] })).toBe(50);
    expect(starsOf({ repo: "user/repo", items: [r2] })).toBeUndefined();
  });

  it("compareByStars sorts by stars descending with fallback", () => {
    const cmp = compareByStars<number | undefined>(
      (n) => n,
      () => 0,
    );
    expect(cmp(100, 50)).toBeLessThan(0);
    expect(cmp(50, 100)).toBeGreaterThan(0);
    expect(cmp(undefined, 100)).toBeGreaterThan(0);
    expect(cmp(100, undefined)).toBeLessThan(0);
  });

  it("groupRowsByRepo groups and sorts items within repository", () => {
    const r1 = makeRow("b", "user/repo1", 10, 0, 1000);
    const r2 = makeRow("a", "user/repo1", 20, 0, 2000);
    const r3 = makeRow("c", "user/repo2", 30, 0, 500);

    const groups = groupRowsByRepo([r1, r2, r3]);
    expect(groups).toHaveLength(2);
    expect(groups[0].repo).toBe("user/repo1");
    // Newest install first
    expect(groups[0].items[0].skill.name).toBe("a");
    expect(groups[0].items[1].skill.name).toBe("b");
  });

  it("sortRepoGroups pins local unlinked repo to the front", () => {
    const gLocal = { repo: "", items: [makeRow("local", "", 0)] };
    const gStore = { repo: "user/repo", items: [makeRow("store", "user/repo", 10, 50)] };

    const sorted = sortRepoGroups([gStore, gLocal]);
    expect(sorted[0].repo).toBe("");
    expect(sorted[1].repo).toBe("user/repo");
  });

  it("sortSkillRows respects popularity sort and installed time sort", () => {
    const r1 = makeRow("low-recent", "u/r", 10, 0, 2000);
    const r2 = makeRow("high-old", "u/r", 1000, 0, 1000);

    const byPop = sortSkillRows([r1, r2], "popularity", "en", false);
    expect(byPop[0].skill.name).toBe("high-old");

    const byTime = sortSkillRows([r1, r2], "installed", "en", false);
    expect(byTime[0].skill.name).toBe("low-recent");
  });

  it("buildRowOrdinals assigns 0-indexed positions within sections or groups", () => {
    const r1 = makeRow("s1", "u/r", 10);
    const r2 = makeRow("s2", "u/r", 5);
    const r3 = makeRow("s3", "u/r", 1, 0, null, false);

    const ordinals = buildRowOrdinals("popularity", [], {
      enabled: [r1, r2],
      disabled: [r3],
    });

    expect(ordinals.get("u/r/s1")).toBe(0);
    expect(ordinals.get("u/r/s2")).toBe(1);
    expect(ordinals.get("u/r/s3")).toBe(0); // restarted in disabled group
  });
});
