import { describe, expect, it } from "vitest";

import {
  SCATTERED_CARD_CLASS,
  SCATTER_MAX_DEGREES,
  SCATTER_MAX_OFFSET,
  scatterOf,
  scatterStyle,
} from "./scatter";

describe("scatterOf", () => {
  it("answers the same pose for the same seed", () => {
    expect(scatterOf("acme/tools")).toEqual(scatterOf("acme/tools"));
  });

  it("answers different poses for different seeds", () => {
    const poses = new Set(
      [
        "acme/tools",
        "acme/other",
        "local",
        "vercel/ai",
        "anthropics/skills",
        "a/b",
        "c/d",
        "e/f",
      ].map((seed) => JSON.stringify(scatterOf(seed))),
    );
    // Eight cards cannot all land on the identical pose — that is the whole
    // point of the scatter.
    expect(poses.size).toBeGreaterThan(1);
  });

  it("keeps every axis inside its bounds", () => {
    for (let i = 0; i < 500; i++) {
      const { rotate, x, y } = scatterOf(`seed-${i}`);
      expect(Math.abs(rotate)).toBeLessThanOrEqual(SCATTER_MAX_DEGREES);
      expect(Math.abs(x)).toBeLessThanOrEqual(SCATTER_MAX_OFFSET);
      expect(Math.abs(y)).toBeLessThanOrEqual(SCATTER_MAX_OFFSET);
    }
  });

  it("uses both signs of every axis", () => {
    const poses = Array.from({ length: 200 }, (_, i) => scatterOf(`s-${i}`));
    expect(poses.some((p) => p.rotate < 0)).toBe(true);
    expect(poses.some((p) => p.rotate > 0)).toBe(true);
    expect(poses.some((p) => p.x < 0)).toBe(true);
    expect(poses.some((p) => p.x > 0)).toBe(true);
    expect(poses.some((p) => p.y < 0)).toBe(true);
    expect(poses.some((p) => p.y > 0)).toBe(true);
  });
});

describe("scatterStyle", () => {
  it("states the pose as custom properties a class can read", () => {
    expect(scatterStyle({ rotate: -1.5, x: 3, y: -4 })).toEqual({
      "--scatter-rotate": "-1.5deg",
      "--scatter-x": "3px",
      "--scatter-y": "-4px",
    });
  });
});

describe("SCATTERED_CARD_CLASS", () => {
  it("straightens on hover and on focus within", () => {
    expect(SCATTERED_CARD_CLASS).toContain("hover:[transform:none]");
    expect(SCATTERED_CARD_CLASS).toContain("focus-within:[transform:none]");
  });
});
