/**
 * The controls both lists show, held in one place because they mean one thing:
 * there is a single search field and a single unit switch, and the state behind
 * them cannot belong to either page. A page reads the slice it needs out of
 * here and answers with it; the page showing the list writes.
 *
 * Module-level rather than a context because the two lists are never mounted
 * together — each page renders its own copy of the controls while the other is
 * gone — so the state has to outlive the page that set it. That the state
 * outlives the page is the point, not a side effect: a query typed on one list
 * is still there on the other, which is what one field shared by two lists
 * means. (It is also plain state rather than a render-time value, the same
 * reason `lib/view-memory` and the registry client's snapshot are module-level.)
 *
 * What is *not* here is everything that is one page's own business: the
 * revealed depth, the scroll position, which folds are open. Those belong to
 * the page that renders the list, and stay there.
 */

/** The two lists the app shows. */
export type Destination = "store" | "installed";

/**
 * What a skill list is made of: one repository card each, or one skill row
 * each. Absent in a view written before the switch existed, and read as `repo`
 * — the shape both lists had first.
 */
export type ListUnit = "repo" | "skill";

/** One list's own reading: how it is made up, and what it is narrowed to. */
export interface DestinationView {
  unit: ListUnit;
  /**
   * The scope that list is narrowed to, by its own taxonomy's key: a domain for
   * the store, a classification for the installed list. Absent is "every
   * scope" — what the chips call 全部.
   */
  scope?: string;
}

/** Everything the shared controls say. */
export interface ListViewState {
  /**
   * What the reader is looking for — one query, both lists. Switching lists
   * answers the same question about the other collection instead of silently
   * emptying the field, which is what a query per page would look like: two
   * searches, two places, no way to tell which one is in charge.
   */
  query: string;
  /** Per list, because how a list reads is that list's answer to give. */
  views: Readonly<Record<Destination, DestinationView>>;
}

/** Both units read as repositories until the reader says otherwise. */
const INITIAL: ListViewState = {
  query: "",
  views: { store: { unit: "repo" }, installed: { unit: "repo" } },
};

let state = INITIAL;
const subscribers = new Set<() => void>();

function publish(next: ListViewState): void {
  state = next;
  for (const listener of subscribers) listener();
}

/** The current state; a stable reference until the next change. */
export function getListView(): ListViewState {
  return state;
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeListView(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/** Point both lists at a new question. */
export function setQuery(query: string): void {
  if (query === state.query) return;
  publish({ ...state, query });
}

/**
 * How one list reads. The scope goes with the unit: the two units file their
 * taxonomies differently (a repository's leading domain against a skill's own),
 * so a scope read under one may mean nothing under the other — and leaving it
 * standing would narrow the new unit for a reason the reader never asked for.
 */
export function setUnit(destination: Destination, unit: ListUnit): void {
  if (unit === state.views[destination].unit) return;
  publish({
    ...state,
    views: { ...state.views, [destination]: { unit } },
  });
}

/** Narrow one list to a scope, or — with `null` — to every scope. */
export function setScope(destination: Destination, scope: string | null): void {
  const { unit, scope: current } = state.views[destination];
  if ((scope ?? undefined) === current) return;
  const next: DestinationView = scope === null ? { unit } : { unit, scope };
  publish({ ...state, views: { ...state.views, [destination]: next } });
}

/** Test hook: forget both lists, so one case cannot inherit another's. */
export function resetListView(): void {
  publish(INITIAL);
}
