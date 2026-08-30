import { describe, expect, it } from "vitest";

import type { Skill } from "../../../types/skill";
import { buildHeroSlides, HERO_RANK_SIZE } from "./featured-rankings";

/** A skill fixture with overrides; repo derives from the name. */
function skill(name: string, over: Partial<Skill> = {}): Skill {
  return {
    name,
    repo: `acme/${name}`,
    description: `${name} description`,
    stars: 10,
    downloads: 1_000,
    ...over,
  };
}

describe("buildHeroSlides", () => {
  it("ranks the weekly slide by the most recent week, top-3 only", () => {
    const slides = buildHeroSlides([
      skill("a", { weeklyInstalls: 100 }),
      skill("b", { weeklyInstalls: 5_000 }),
      skill("c", { weeklyInstalls: 1_200 }),
      skill("d", { weeklyInstalls: 300 }),
      skill("no-weekly"),
    ]);

    const weekly = slides.find((s) => s.id === "weekly");
    expect(weekly?.title).toBe("Skill 周榜");
    expect(weekly?.entries.map((e) => e.skill.name)).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(weekly?.entries[0].rank).toBe(1);
    expect(weekly?.entries).toHaveLength(HERO_RANK_SIZE);
    // Metric labels carry the weekly unit so the three slides read apart.
    expect(weekly?.entries[0].label).toBe("5K/周");
  });

  it("ranks the popular slide by lifetime installs", () => {
    const slides = buildHeroSlides([
      skill("small", { downloads: 10 }),
      skill("huge", { downloads: 900_000 }),
      skill("mid", { downloads: 40_000 }),
    ]);

    const popular = slides.find((s) => s.id === "popular");
    expect(popular?.entries.map((e) => e.skill.name)).toEqual([
      "huge",
      "mid",
      "small",
    ]);
    expect(popular?.entries[0].label).toBe("900K");
  });

  it("ranks the rising slide by weekly share and skips small catalogs", () => {
    const slides = buildHeroSlides([
      // Below the rising floor: a huge ratio from a tiny catalog stays out.
      skill("newbie", { downloads: 9_000, weeklyInstalls: 8_000 }),
      // Ranked by weekly/lifetime share, descending.
      skill("steady", { downloads: 20_000, weeklyInstalls: 5_000 }),
      skill("growing", { downloads: 50_000, weeklyInstalls: 6_000 }),
      skill("cooling", { downloads: 100_000, weeklyInstalls: 4_000 }),
    ]);

    const rising = slides.find((s) => s.id === "rising");
    expect(rising?.entries.map((e) => e.skill.name)).toEqual([
      "steady",
      "growing",
      "cooling",
    ]);
  });

  it("drops leaderboards without qualifying skills", () => {
    // Nothing has weekly data: the weekly and rising slides vanish, and an
    // all-zero index yields no slides at all.
    const slides = buildHeroSlides([
      skill("a", { downloads: 10 }),
      skill("b", { downloads: 0 }),
    ]);
    expect(slides.map((s) => s.id)).toEqual(["popular"]);

    expect(buildHeroSlides([])).toEqual([]);
    expect(buildHeroSlides([skill("zero", { downloads: 0 })])).toEqual([]);
  });
});
