/**
 * How many facet chips fit on one line of the header, with the rest left to the
 * trailing control that hides them (see `ListFacets`).
 *
 * The line is a single row of a fixed height, so the chips that do not fit have
 * to give way rather than wrap: the reader gets as many scopes at a glance as
 * the window allows, and the ones that fell off are one press away instead of
 * cut in half at the edge. Widening the window brings more of them back, which
 * is why the count is measured rather than fixed.
 *
 * Pure, so the arithmetic can be read off directly in a test: the caller
 * measures widths and hands them in.
 *
 * @param widths   every chip's width, in display order
 * @param available the row's own width — what the chips share after the pinned
 *                  全部 chip, which sits outside this count
 * @param trailing the trailing control's width, reserved only when something is
 *                 left over for it
 * @param gap      the row's gap between two neighbours
 */
export function facetFitCount({
  widths,
  available,
  trailing,
  gap,
}: {
  widths: readonly number[];
  available: number;
  trailing: number;
  gap: number;
}): number {
  // Nothing fits in no room.
  if (available <= 0) return 0;

  // With every chip on the line there is no trailing control, so the row pays
  // one gap fewer than it would with one.
  const all = widths.reduce((total, width) => total + width, 0);
  if (all + Math.max(0, widths.length - 1) * gap <= available) return widths.length;

  // Otherwise the trailing control takes a slot of its own at the end, and the
  // chips fill what is left of the line in order.
  let fit = 0;
  let used = 0;
  for (const width of widths) {
    const next = used + (fit > 0 ? gap : 0) + width;
    if (next + gap + trailing > available) break;
    used = next;
    fit += 1;
  }
  return fit;
}
