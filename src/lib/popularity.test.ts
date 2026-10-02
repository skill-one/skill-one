import { describe, expect, it } from "vitest";

import { popularity } from "./popularity";
import type { Skill } from "../types/skill";

const skill = (downloads: number, stars: number): Skill => ({
  name: "x",
  repo: "acme/x",
  description: "",
  downloads,
  stars,
});

describe("popularity", () => {
  // The order the whole app presents by, and the number beside every row, come
  // from this one function. These values are pinned rather than recomputed: a
  // change here silently re-ranks the store, so it must be a deliberate edit.
  it("blends installs and stars into one figure", () => {
    expect(popularity(skill(2_991_984, 169_600))).toBe(712_350);
    expect(popularity(skill(50_000, 900))).toBe(6_711);
    expect(popularity(skill(1_000, 700))).toBe(837);
  });

  it("weighs the two counts equally instead of following the larger one", () => {
    // An arithmetic half-and-half would answer 1.6M here and 84.8K there — in
    // practice the larger count deciding the order on its own.
    expect(popularity(skill(2_991_984, 169_600))).toBeLessThan(1_000_000);
    expect(popularity(skill(0, 169_600))).toBe(411);
    // Swapping the two inputs cannot change the figure: both carry the same
    // weight, whatever their magnitude.
    expect(popularity(skill(20_000, 5))).toBe(popularity(skill(5, 20_000)));
  });

  it("scores nothing without either signal", () => {
    expect(popularity(skill(0, 0))).toBe(0);
    // A missing count drags the blend down rather than being ignored, which is
    // why a figure of 0 never hides behind a famous repository.
    expect(popularity(skill(0, 5_000))).toBe(popularity(skill(5_000, 0)));
  });

  it("tolerates the negative values a stale cache can carry", () => {
    expect(popularity(skill(-5, -5))).toBe(0);
  });
});
