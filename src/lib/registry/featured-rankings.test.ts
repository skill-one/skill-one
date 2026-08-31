import { describe, expect, it } from "vitest";

import {
  buildHeroSlides,
  HERO_RANK_SIZE,
  RANKINGS,
  RANKING_SIZE,
  rankSkills,
  rankingById,
} from "./featured-rankings";
import type { Skill } from "../../types/skill";

function skill(name: string, over: Partial<Skill> = {}): Skill {
  return {
    name,
    repo: `acme/${name}`,
    description: "",
    stars: 1,
    downloads: 1_000,
    ...over,
  };
}

/**
 * A registry every leaderboard ranks the same way: `s0` leads, then `s1`,
 * and so on. Downloads taper linearly while weekly installs taper
 * quadratically, so the weekly/lifetime ratio tapers too — putting the
 * weekly, popular and rising boards in one and the same order.
 */
function ladder(n: number, over: Partial<Skill> = {}): Skill[] {
  return Array.from({ length: n }, (_, i) =>
    skill(`s${i}`, {
      downloads: (n - i) * 1_000,
      weeklyInstalls: (n - i) * (n - i),
      ...over,
    }),
  );
}

describe("RANKINGS", () => {
  it("keeps every id unique and stable", () => {
    const ids = RANKINGS.map((ranking) => ranking.id);
    expect(ids).toEqual(["weekly", "popular", "rising"]);
  });

  it("looks a leaderboard up by id", () => {
    expect(rankingById("weekly")?.title).toBe("Skill 周榜");
    expect(rankingById("popular")?.title).toBe("人气总榜");
    expect(rankingById("rising")?.title).toBe("新晋热门");
  });

  it("returns undefined for an unknown id", () => {
    expect(rankingById("nope")).toBeUndefined();
  });
});

describe("rankSkills", () => {
  it("ranks by the definition's metric, descending", () => {
    const skills = [
      skill("low", { downloads: 10 }),
      skill("high", { downloads: 999 }),
      skill("mid", { downloads: 100 }),
    ];
    const { entries } = rankSkills(skills, RANKINGS[1], RANKING_SIZE);

    expect(entries.map((entry) => entry.skill.name)).toEqual([
      "high",
      "mid",
      "low",
    ]);
    // Ranks are 1-based and follow the sorted order.
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(entries[0].label).toBe("999");
  });

  it("truncates to the limit but reports the full qualifying total", () => {
    const { entries, total } = rankSkills(
      ladder(250),
      RANKINGS[1],
      RANKING_SIZE,
    );

    expect(entries).toHaveLength(RANKING_SIZE);
    expect(total).toBe(250);
    expect(entries.at(-1)?.rank).toBe(RANKING_SIZE);
  });

  it("drops skills below the floor without ranking them", () => {
    const skills = [skill("zero", { downloads: 0 }), skill("one", { downloads: 1 })];
    const { entries, total } = rankSkills(skills, RANKINGS[1], RANKING_SIZE);

    expect(entries.map((entry) => entry.skill.name)).toEqual(["one"]);
    expect(total).toBe(1);
  });

  it("reads weekly installs, treating a missing series as zero", () => {
    const skills = [
      skill("none"),
      skill("some", { weeklyInstalls: 5, downloads: 1 }),
    ];
    const { entries } = rankSkills(skills, RANKINGS[0], RANKING_SIZE);

    expect(entries.map((entry) => entry.skill.name)).toEqual(["some"]);
  });

  it("keeps the rising leaderboard behind its lifetime-install floor", () => {
    const skills = [
      // A brand-new skill: a perfect ratio, but far too small to rank.
      skill("tiny", { downloads: 100, weeklyInstalls: 100 }),
      skill("grown", { downloads: 20_000, weeklyInstalls: 5_000 }),
    ];
    const { entries, total } = rankSkills(skills, RANKINGS[2], RANKING_SIZE);

    expect(entries.map((entry) => entry.skill.name)).toEqual(["grown"]);
    expect(total).toBe(1);
  });

  it("ranks the rising leaderboard by ratio, not by raw weekly installs", () => {
    const skills = [
      skill("big", { downloads: 100_000, weeklyInstalls: 1_000 }),
      skill("hot", { downloads: 10_000, weeklyInstalls: 900 }),
    ];
    const { entries } = rankSkills(skills, RANKINGS[2], RANKING_SIZE);

    expect(entries.map((entry) => entry.skill.name)).toEqual(["hot", "big"]);
  });
});

describe("buildHeroSlides", () => {
  it("shows the top 3 of every leaderboard", () => {
    const slides = buildHeroSlides(ladder(50));

    expect(slides).toHaveLength(RANKINGS.length);
    for (const slide of slides) {
      expect(slide.entries).toHaveLength(HERO_RANK_SIZE);
      expect(slide.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
      expect(slide.entries.map((entry) => entry.skill.name)).toEqual([
        "s0",
        "s1",
        "s2",
      ]);
    }
  });

  it("serves the hero and the leaderboard page from one definition", () => {
    // The guard this refactor exists for: the banner's top 3 must be the
    // first 3 rows of the page's list, not a second, drifting ranking.
    const skills = ladder(150);
    const slides = buildHeroSlides(skills);

    for (const def of RANKINGS) {
      const slide = slides.find((s) => s.id === def.id)!;
      const { entries } = rankSkills(skills, def, RANKING_SIZE);
      expect(slide.entries).toEqual(entries.slice(0, HERO_RANK_SIZE));
    }
  });

  it("carries the presentation of its leaderboard", () => {
    const slides = buildHeroSlides(ladder(50));

    expect(slides).toHaveLength(RANKINGS.length);
    for (const def of RANKINGS) {
      const slide = slides.find((s) => s.id === def.id)!;
      expect(slide.title).toBe(def.title);
      expect(slide.subtitle).toBe(def.subtitle);
      expect(slide.gradient).toBe(def.gradient);
    }
  });

  it("drops a leaderboard no skill qualifies for", () => {
    // Installs exist, but nothing was installed this week and nothing is
    // old enough to rise — only the lifetime board survives.
    const skills = ladder(5, { downloads: 5_000, weeklyInstalls: 0 });

    expect(buildHeroSlides(skills).map((slide) => slide.id)).toEqual([
      "popular",
    ]);
  });

  it("renders no slides at all for an empty registry", () => {
    expect(buildHeroSlides([])).toEqual([]);
  });
});
