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
 * Each list's order and shape persist across sessions in `localStorage` (via the
 * guarded `storage` wrapper — a blocked write costs persistence and nothing
 * else); the query and the scopes stay session-only, because a question asked
 * and a taxonomy slice chosen are this visit's business.
 */

import { storage } from "./storage";

/** The two lists the app shows. */
export type Destination = "store" | "installed";

/**
 * How a list orders itself while no search is live. `popularity` is the
 * registry's blended installs-and-stars figure (`lib/popularity.ts`), the
 * figure every row displays; `installed` is the install's own clock (newest
 * first); `tokens` is the skill's estimated context cost (`lib/token-estimate`,
 * heaviest first).
 *
 * Every one of these is an order and nothing else: which rows the list is made
 * of is the shape's own business (`ListUnit`), because "按仓库" never said which
 * repository was meant — it said how many, and so stood for the reading rather
 * than for an order within one. A sort that also changed the shape could not be
 * persisted as one value without the two answers travelling together, which is
 * why the two are one value each again.
 */
export type ListSort = "installed" | "popularity" | "tokens";

/**
 * The orders each list answers in. The installed list carries the install's own
 * clock and the token estimate among its options — both facts only an on-disk
 * record has. The store has neither install of its own to clock nor a locally
 * measured cost to weigh, so it answers in one order: the figure its rows
 * display, which needs no switch to name.
 */
export const LIST_SORTS: Readonly<Record<Destination, readonly ListSort[]>> = {
  store: ["popularity"],
  installed: ["popularity", "installed", "tokens"],
};

/**
 * The two shapes a list is read in — one repository card each, or one skill row
 * each. A stored choice of its own, because it is a choice about the screen and
 * not about the reading: the same rows in the same order are a different list
 * when they are cards rather than rows, and the reader is deciding which one
 * they want to look at.
 */
export type ListUnit = "repo" | "skill";

/** One list's own reading: what order it answers in, what shape it takes, and what it is narrowed to. */
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
  /**
   * The shape the list is read in. Absent is `skill` — one row per skill,
   * which is the plain reading of a list of skills and the shape the store
   * opens in.
   */
  unit?: ListUnit;
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

/** The default shape is the plain one: a row per skill. */
const DEFAULT_UNIT: ListUnit = "skill";

/**
 * One key per list, so each keeps its own answer under its own name. The shape
 * key is written again: it was merged into the sort key while the two shared one
 * control, and a stored shape is honoured once more — a `repo` sort left by that
 * era is read as the shape it was standing for.
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
  return undefined;
}

function readStoredUnit(destination: Destination): ListUnit | undefined {
  // One-time reading of the merged era: that control carried the shape as its
  // repository option, so a stored `repo` sort is read as the shape it stood
  // for. The stale key is left behind — reading it again would answer the same
  // thing, and a reader who has since changed the shape has written over it.
  if (storage.getItem(SORT_KEY_PREFIX + destination) === "repo") return "repo";
  return storage.getItem(UNIT_KEY_PREFIX + destination) === "repo"
    ? "repo"
    : undefined;
}

function storedView(destination: Destination): DestinationView {
  const view: DestinationView = {};
  const sort = readStoredSort(destination);
  const unit = readStoredUnit(destination);
  if (sort !== undefined) view.sort = sort;
  if (unit !== undefined) view.unit = unit;
  return view;
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
  unit: ListUnit | undefined,
): DestinationView {
  const view: DestinationView = {};
  if (sort !== undefined) view.sort = sort;
  if (scope !== undefined) view.scope = scope;
  if (unit !== undefined) view.unit = unit;
  return view;
}

/**
 * How one list orders itself while no search is live. The choice persists
 * across sessions under the list's own key; it survives a scope and a shape
 * change, because a popularity answer means the same thing in every slice of
 * either shape. A sort the list does not answer in is refused: the caller holds
 * the list's own orders, so only a hand-built call can offer one — which is also
 * what keeps the shape the merged control used to carry out of this one.
 */
export function setSort(destination: Destination, sort: ListSort): void {
  if (!LIST_SORTS[destination].includes(sort)) return;
  const { scope, unit, sort: current } = state.views[destination];
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
        unit,
      ),
    },
  });
}

/**
 * The shape one list is read in — repository cards or skill rows. It persists
 * across sessions like the order does, because it is the same kind of answer
 * about the same list: a reader who reads one of these in cards tomorrow means
 * to read it in cards tomorrow.
 */
export function setUnit(destination: Destination, unit: ListUnit): void {
  const { scope, sort, unit: current } = state.views[destination];
  if (unit === current) return;
  if (unit === DEFAULT_UNIT) storage.removeItem(UNIT_KEY_PREFIX + destination);
  else storage.setItem(UNIT_KEY_PREFIX + destination, unit);
  publish({
    ...state,
    views: {
      ...state.views,
      // Absent for the default shape, exactly as the default order is.
      [destination]: buildView(
        sort,
        scope,
        unit === DEFAULT_UNIT ? undefined : unit,
      ),
    },
  });
}

/** Narrow one list to a scope, or — with `null` — to every scope. */
export function setScope(destination: Destination, scope: string | null): void {
  const { sort, unit, scope: current } = state.views[destination];
  if ((scope ?? undefined) === current) return;
  publish({
    ...state,
    views: {
      ...state.views,
      [destination]: buildView(sort, scope ?? undefined, unit),
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
