import { describe, expect, it } from "vitest";

import { facetFitCount } from "./facet-overflow";

/** A roomy line with a trailing control that takes a slot of its own. */
const base = { available: 300, trailing: 60, gap: 6 };

describe("facetFitCount", () => {
  it("takes every chip when the line holds them all", () => {
    // 40 + 40 + 40 and the two gaps between them: 132 of 300, and with nothing
    // left over there is no trailing control to reserve.
    expect(facetFitCount({ ...base, widths: [40, 40, 40] })).toBe(3);
  });

  it("reserves the trailing control once something has to go", () => {
    // Three 100s need 312, so the control appears and takes a slot with a gap
    // before it: 100, then 206, then the third would need 378.
    expect(facetFitCount({ ...base, widths: [100, 100, 100] })).toBe(2);
  });

  it("shows no chip rather than a chip and no way to the rest", () => {
    // The first chip would leave 280 + 6 + 60 = 346 > 300: the control is the
    // only thing that fits, and it still reaches every hidden scope.
    expect(facetFitCount({ ...base, widths: [280, 40] })).toBe(0);
  });

  it("counts an empty row as zero, and no room as nothing", () => {
    expect(facetFitCount({ ...base, widths: [] })).toBe(0);
    expect(facetFitCount({ ...base, available: 0, widths: [10, 10] })).toBe(0);
  });

  it("grows with the line", () => {
    const widths = [50, 50, 50, 50, 50];
    expect(facetFitCount({ ...base, available: 200, widths })).toBe(2);
    expect(facetFitCount({ ...base, available: 600, widths })).toBe(5);
  });
});
