/**
 * What a list page's view is, remembered per history entry.
 *
 * A page that owns its own scroll container loses everything when the reader
 * drills into something and comes back: the router unmounts it, the browser
 * restores nothing (its own scroll restoration only ever covers the document,
 * and the document here never scrolls), and every control and every reveal on
 * the page resets with the component. So a page hands its view here on the way
 * past and takes it back when it returns.
 *
 * The key is the *history entry's* key — react-router's own, written into
 * `history.state` with every entry and stable across back and forward — rather
 * than the page's path. Two entries of the same path are two different views:
 * coming back to the list is a return, and a fresh visit from the sidebar is a
 * fresh visit, and a memory keyed by path would confuse the two.
 *
 * In memory, for the life of the window, on purpose: a scroll position is
 * orientation, not a preference, and an app that has just launched has nowhere
 * to be scrolled to.
 */
export type ViewMemory<V> = {
  /** The page's own controls and reveal depth, as the page holds them. */
  view: V;
  /** Where the page's scroller sat, in pixels. */
  scrollTop: number;
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
