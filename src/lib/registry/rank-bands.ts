/**
 * Cut an already ranked list into rank bands for the store's browse grid.
 *
 * The leading band holds the first {@link FIRST_RANK_BAND} entries and wears
 * the "Top 25" name. Every boundary after that doubles (26–50, 51–100,
 * 101–200, 201–400, …): the head of the ranking is filed finely, where the
 * ordering matters most, and the long tail is paced with few headers. This is
 * the leaderboard convention rather than equal-width slices, which would pile
 * up dozens of "126–150" headers over a large registry.
 *
 * Positions are 1-based. The last band ends at the list's real length — a band
 * that is not full keeps its actual range ("201–340", never "201–400").
 *
 * Bands are a presentation cut only: the ranking is the one
 * `byRepoRank` defines, and under a domain filter it is that domain's own
 * ranking the bands are cut from.
 */

/** Size (and name) of the leading band. */
export const FIRST_RANK_BAND = 25;

/** One rank band: a header title, its 1-based inclusive rank range, its items. */
export interface RankBand<T> {
  /**
   * Stable identity: the band's starting position. The streamed answer can
   * grow a tail band's range, but a band never moves its start, so keying a
   * fold on this keeps its state across streaming re-answers.
   */
  key: string;
  /** Header text — `Top 25` for the leading band, `26–50` for the rest. */
  title: string;
  /** 1-based rank the band starts at. */
  start: number;
  /** 1-based rank of the band's real last item. */
  end: number;
  items: T[];
}

/**
 * Split a ranked list into bands (see file comment). An empty list yields no
 * bands. A list of at most {@link FIRST_RANK_BAND} yields the single leading
 * band; callers that prefer a flat, headerless grid at that size check
 * {@link FIRST_RANK_BAND} themselves.
 */
export function rankBands<T>(items: readonly T[]): RankBand<T>[] {
  const bands: RankBand<T>[] = [];
  let start = 1;
  let boundary = FIRST_RANK_BAND;
  while (start <= items.length) {
    const end = Math.min(boundary, items.length);
    bands.push({
      key: `rank-${start}`,
      title: start === 1 ? `Top ${FIRST_RANK_BAND}` : `${start}–${end}`,
      start,
      end,
      items: items.slice(start - 1, end),
    });
    start = end + 1;
    boundary *= 2;
  }
  return bands;
}
