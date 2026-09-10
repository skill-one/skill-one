import type { Skill } from "../types/skill";

/**
 * The registry's one popularity figure: installs and stars blended half and
 * half.
 *
 * The blend is a geometric mean, not an arithmetic one. The two inputs sit on
 * very different scales (a widely installed skill can report 3M installs
 * against 170K stars), so averaging them linearly leaves the larger count with
 * nearly all the weight — "50/50" in name only. A geometric mean is the equal
 * weighting in log space: doubling either input moves the result by the same
 * amount, and a zero on one side cannot be carried by the other. That last
 * property is deliberate — quietly falling back to whichever count exists would
 * give one figure two different meanings.
 *
 * Single source of truth on purpose: the browsed list, the search ranking's
 * popularity weight, the leaderboards and the number on a row all read this
 * one function, so an order can never contradict the figures beside it.
 *
 * The result is not a count of anything. It is a relative figure, which is why
 * it renders through `formatCount` without a unit and why the row's tooltip
 * always breaks it back down into the two numbers it came from.
 */
export function popularity({ downloads, stars }: Skill): number {
  // The offsets keep a legitimate zero from collapsing the product, while
  // still making a skill with neither figure score 0.
  return Math.round(
    Math.sqrt((Math.max(0, downloads) + 1) * (Math.max(0, stars) + 1)) - 1,
  );
}
