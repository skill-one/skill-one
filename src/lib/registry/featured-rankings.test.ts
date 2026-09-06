import { describe, expect, it } from "vitest";

import {
  buildHeroSlides,
  HERO_RANK_SIZE,
  RANKINGS,
  RANKING_SIZE,
  rankSkills,
  rankingById,
  skillIdOf,
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
 * A registry the popular leaderboard ranks the same way every time: `s0`
 * leads, then `s1`, and so on.
 */
function ladder(n: number, over: Partial<Skill> = {}): Skill[] {
  return Array.from({ length: n }, (_, i) =>
    skill(`s${i}`, {
      downloads: (n - i) * 1_000,
      ...over,
    }),
  );
}

describe("RANKINGS", () => {
  it("keeps every id unique and stable", () => {
    const ids = RANKINGS.map((ranking) => ranking.id);
    expect(ids).toEqual(["trending", "popular"]);
  });

  it("looks a leaderboard up by id", () => {
    expect(rankingById("trending")?.title).toBe("趋势热榜");
    expect(rankingById("popular")?.title).toBe("人气总榜");
  });

  it("returns undefined for an unknown id", () => {
    expect(rankingById("nope")).toBeUndefined();
  });
});

describe("skillIdOf", () => {
  it("joins repo and name into the canonical skills.sh id", () => {
    expect(skillIdOf(skill("pdf", { repo: "anthropics/skills" }))).toBe(
      "anthropics/skills/pdf",
    );
  });
});

describe("rankSkills", () => {
  it("ranks the popular leaderboard by installs, descending", () => {
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

  it("ranks the trending leaderboard in upstream order, joining by id", () => {
    const skills = ladder(5);
    const ids = ["acme/s4/s4", "acme/s1/s1", "absent/repo/x", "acme/s0/s0"];
    const { entries, total } = rankSkills(skills, RANKINGS[0], RANKING_SIZE, ids);

    // Upstream rank order wins; ids missing from the registry are skipped.
    expect(entries.map((entry) => entry.skill.name)).toEqual([
      "s4",
      "s1",
      "s0",
    ]);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(entries[0].label).toBe("1K");
    // The total counts registry hits only.
    expect(total).toBe(3);
  });

  it("truncates the trending leaderboard to the limit", () => {
    const { entries, total } = rankSkills(
      ladder(50),
      RANKINGS[0],
      3,
      ladder(50).map(skillIdOf),
    );

    expect(entries).toHaveLength(3);
    expect(total).toBe(50);
  });

  it("ranks nothing when the trending list is missing or empty", () => {
    const skills = ladder(5);

    expect(rankSkills(skills, RANKINGS[0], RANKING_SIZE, null).entries).toEqual(
      [],
    );
    expect(rankSkills(skills, RANKINGS[0], RANKING_SIZE, []).total).toBe(0);
  });
});

describe("buildHeroSlides", () => {
  it("shows the top 3 of every leaderboard", () => {
    const skills = ladder(50);
    const trendingIds = skills.map(skillIdOf);
    const slides = buildHeroSlides(skills, trendingIds);

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
    const trendingIds = skills.map(skillIdOf);
    const slides = buildHeroSlides(skills, trendingIds);

    for (const def of RANKINGS) {
      const slide = slides.find((s) => s.id === def.id)!;
      const { entries } = rankSkills(skills, def, RANKING_SIZE, trendingIds);
      expect(slide.entries).toEqual(entries.slice(0, HERO_RANK_SIZE));
    }
  });

  it("carries the presentation of its leaderboard", () => {
    const skills = ladder(50);
    const trendingIds = skills.map(skillIdOf);
    const slides = buildHeroSlides(skills, trendingIds);

    expect(slides).toHaveLength(RANKINGS.length);
    for (const def of RANKINGS) {
      const slide = slides.find((s) => s.id === def.id)!;
      expect(slide.title).toBe(def.title);
      expect(slide.subtitle).toBe(def.subtitle);
      expect(slide.gradient).toBe(def.gradient);
    }
  });

  it("drops the trending slide when the trending list is unavailable", () => {
    const skills = ladder(5);

    expect(buildHeroSlides(skills, null).map((slide) => slide.id)).toEqual([
      "popular",
    ]);
  });

  it("renders no slides at all for an empty registry", () => {
    expect(buildHeroSlides([], ["acme/s0/s0"])).toEqual([]);
  });
});
