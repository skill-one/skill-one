/**
 * What a list page's view is, remembered per page.
 *
 * A page that owns its own scroll container loses everything whenever the
 * reader switches away and comes back: the router unmounts it, the browser
 * restores nothing (its own scroll restoration only ever covers the document,
 * and the document here never scrolls), and every control, every fold and
 * every reveal on the page resets with the component. So a page hands its view
 * here on the way past and takes it back when it returns.
 *
 * The key is the page's own name, not a history entry's: the reader who moves
 * from the store to the installed list and back is returning to the same page,
 * and expects the page they left — the folds they had made and the place they
 * had scrolled to — not a fresh one. This memory was once keyed per history
 * entry, which made every sidebar visit a fresh visit; the reader's own answer
 * is that switching pages is returning, so the memory follows the page.
 *
 * What keeps a return honest is the memory's `signature`: the answer the page
 * was showing when the view was written. The controls are shared module state
 * that can re-answer a page without it ever being unmounted, and a depth or a
 * fold remembered under one answer is not a place the reader was ever at under
 * another — so a return to a differently-shaped answer is dropped back to the
 * fresh view rather than restored into a stale one.
 *
 * In memory, for the life of the window, on purpose: a scroll position is
 * orientation, not a preference, and an app that has just launched has nowhere
 * to be scrolled to.
 */
export type ViewMemory<V> = {
  /** The page's own reveal depth, as the page holds it. */
  view: V;
  /** Where the page's scroller sat, in pixels. */
  scrollTop: number;
  /**
   * The answer the page was showing when this was written — its query, its
   * unit, its scope, however it names them. A list's controls live in the
   * header, so a page can be re-answered without ever being unmounted; the
   * reader then comes back to the same entry looking at a different list, and
   * a depth from the old one is not a place they were ever at. Callers that
   * have no such identity leave this out, and every visit is the same visit.
   */
  signature?: string;
};

const memories = new Map<string, ViewMemory<unknown>>();

/** The view remembered for one history entry; undefined when there is none. */
export function readViewMemory<V>(key: string): ViewMemory<V> | undefined {
  return memories.get(key) as ViewMemory<V> | undefined;
}

/** Remember one history entry's view, replacing whatever was there. */
export function writeViewMemory<V>(key: string, memory: ViewMemory<V>): void {
  memories.set(key, memory as ViewMemory<unknown>);
}

/** Test hook: forget every entry, so one case cannot restore another's view. */
export function resetViewMemories(): void {
  memories.clear();
}
