/**
 * The controls both lists show, held in one place because they mean one thing:
 * there is a single search field and a single sort switch, and the state behind
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
 *
 * Each list's sort persists across sessions in `localStorage` (via the guarded
 * `storage` wrapper — a blocked write costs persistence and nothing else); the
 * query and the scopes stay session-only, because a question asked and a
 * taxonomy slice chosen are this visit's business.
 */

import { storage } from "./storage";

/** The two lists the app shows. */
export type Destination = "store" | "installed";

/**
 * How a list orders itself while no search is live. `popularity` is the
 * registry's blended installs-and-stars figure (`lib/popularity.ts`), the
 * figure every row displays; `installed` is the install's own clock (newest
 * first); `repo` reads the list as repository cards at all, the cards led by
 * the most-starred repository. On both lists the sort *is* the whole reading —
 * the repository option is the shape the unit switch used to pick, merged into
 * this one control — so a page renders by the unit its sort implies.
 */
export type ListSort = "installed" | "popularity" | "repo";

/**
 * The orders each list answers in. The installed list carries the install's
 * own clock as its middle option; the store has no install of its own to
 * clock, so it answers in the two orders its rows can state. The repository
 * option carries the shape the old unit switch picked on either list, so one
 * control now answers both "what does the screen look like" and "what order
 * does it read in".
 */
export const LIST_SORTS: Readonly<Record<Destination, readonly ListSort[]>> = {
  store: ["popularity", "repo"],
  installed: ["popularity", "installed", "repo"],
};

/**
 * The two shapes a list reads as — one repository card each, or one skill row
 * each. No longer a stored choice of its own: it is the unit the list's sort
 * implies (`repo` sort, repository cards; otherwise skill rows), derived by
 * the page that renders.
 */
export type ListUnit = "repo" | "skill";

/** One list's own reading: what order it answers in, and what it is narrowed to. */
export interface DestinationView {
  /**
   * The sort the list answers in while no search is live. Absent is
   * `popularity` — the default: the figure the rows display is the order the
   * list answers in.
   */
  sort?: ListSort;
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

/** The default order is the figure the rows themselves display: popularity. */
const DEFAULT_SORT: ListSort = "popularity";

/**
 * One key per list, so each keeps its own answer under its own name. The unit
 * key is read-only now: both lists have merged their unit switch into the sort
 * menu, and a stored unit is honoured once — as the repository sort — then
 * left behind.
 */
const UNIT_KEY_PREFIX = "skill-one.listUnit.";
const SORT_KEY_PREFIX = "skill-one.listSort.";

function readStoredSort(destination: Destination): ListSort | undefined {
  const raw = storage.getItem(SORT_KEY_PREFIX + destination);
  if (raw !== null && LIST_SORTS[destination].includes(raw as ListSort)) {
    // The default stays absent from the view, so a fresh list reads exactly
    // as it did before the control existed.
    return raw === DEFAULT_SORT ? undefined : (raw as ListSort);
  }
  // One-time reading of the choice the unit switch used to hold: a reader who
  // had a list in repository cards keeps that reading as the merged control's
  // repository sort. (The installed list migrated when its sort arrived; the
  // store joins it now that its own switch has merged too.)
  if (storage.getItem(UNIT_KEY_PREFIX + destination) === "repo") {
    return "repo";
  }
  return undefined;
}

function storedView(destination: Destination): DestinationView {
  const sort = readStoredSort(destination);
  return sort === undefined ? {} : { sort };
}

function initialViews(): Record<Destination, DestinationView> {
  return {
    store: storedView("store"),
    installed: storedView("installed"),
  };
}

const INITIAL: ListViewState = { query: "", views: initialViews() };

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
 * One list's view, built with the absent-by-default fields genuinely absent:
 * a fresh list reads exactly as it did before `sort` (and any scope) existed.
 */
function buildView(
  sort: ListSort | undefined,
  scope: string | undefined,
): DestinationView {
  const view: DestinationView = {};
  if (sort !== undefined) view.sort = sort;
  if (scope !== undefined) view.scope = scope;
  return view;
}

/**
 * How one list orders itself while no search is live. The choice persists
 * across sessions under the list's own key; it survives a scope change,
 * because a popularity answer means the same thing in every slice. A sort the
 * list does not answer in is refused: the caller holds the list's own menu,
 * so only a hand-built call can offer one.
 */
export function setSort(destination: Destination, sort: ListSort): void {
  if (!LIST_SORTS[destination].includes(sort)) return;
  const { scope, sort: current } = state.views[destination];
  if (sort === current) return;
  if (sort === DEFAULT_SORT) storage.removeItem(SORT_KEY_PREFIX + destination);
  else storage.setItem(SORT_KEY_PREFIX + destination, sort);
  publish({
    ...state,
    views: {
      ...state.views,
      // The default stays absent, exactly as it is never stored.
      [destination]: buildView(
        sort === DEFAULT_SORT ? undefined : sort,
        scope,
      ),
    },
  });
}

/** Narrow one list to a scope, or — with `null` — to every scope. */
export function setScope(destination: Destination, scope: string | null): void {
  const { sort, scope: current } = state.views[destination];
  if ((scope ?? undefined) === current) return;
  publish({
    ...state,
    views: {
      ...state.views,
      [destination]: buildView(sort, scope ?? undefined),
    },
  });
}

/** Test hook: forget both lists, so one case cannot inherit another's. */
export function resetListView(): void {
  for (const destination of ["store", "installed"] as const) {
    storage.removeItem(UNIT_KEY_PREFIX + destination);
    storage.removeItem(SORT_KEY_PREFIX + destination);
  }
  publish({ query: "", views: initialViews() });
}
