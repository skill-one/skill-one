import { describe, expect, it } from "vitest";

import { FIRST_RANK_BAND, rankBands } from "./rank-bands";

/** A ranked list of labeled items, one per rank: item at rank i is `r{i}`. */
function ranked(length: number): string[] {
  return Array.from({ length }, (_, i) => `r${i + 1}`);
}

describe("rankBands", () => {
  it("yields no bands for an empty list", () => {
    expect(rankBands([])).toEqual([]);
  });

  it("keeps a list at most the first band's size in the single Top band", () => {
    const bands = rankBands(ranked(FIRST_RANK_BAND));
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({
      title: "Top 25",
      start: 1,
      end: 25,
    });
    expect(bands[0].items).toEqual(ranked(25));
  });

  it("starts the second 25-wide band once the first overflows", () => {
    const bands = rankBands(ranked(26));
    expect(bands.map((b) => b.title)).toEqual(["Top 25", "26–26"]);
    expect(bands[1]).toMatchObject({ start: 26, end: 26 });
    expect(bands[1].items).toEqual(["r26"]);

    expect(rankBands(ranked(50)).map((b) => b.title)).toEqual([
      "Top 25",
      "26–50",
    ]);
  });

  it("doubles every boundary after the second band", () => {
    const expectedTitles = [
      "Top 25", //   1–25  (25)
      "26–50", //  26–50  (25)
      "51–100", // 51–100 (50)
      "101–200",
      "201–400",
      "401–800",
      "801–1600",
    ];
    const bands = rankBands(ranked(1600));
    expect(bands.map((b) => b.title)).toEqual(expectedTitles);
    expect(bands.map((b) => b.items.length)).toEqual([
      25, 25, 50, 100, 200, 400, 800,
    ]);
  });

  it("truncates the last band at the list's real end", () => {
    const bands = rankBands(ranked(340));
    const tail = bands.at(-1)!;
    expect(tail).toMatchObject({ title: "201–340", start: 201, end: 340 });
    expect(tail.items).toHaveLength(140);
    expect(tail.items[0]).toBe("r201");
    expect(tail.items.at(-1)).toBe("r340");
  });

  it("keys bands by their stable starting rank and keeps every item once", () => {
    const items = ranked(120);
    const bands = rankBands(items);
    expect(bands.map((b) => b.key)).toEqual([
      "rank-1",
      "rank-26",
      "rank-51",
      "rank-101",
    ]);
    expect(bands.flatMap((b) => b.items)).toEqual(items);
  });
});
