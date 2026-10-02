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
 *
 * Each list's unit persists across sessions in `localStorage` (via the guarded
 * `storage` wrapper — a blocked write costs persistence and nothing else); the
 * query and the scopes stay session-only, because a question asked and a
 * taxonomy slice chosen are this visit's business.
 */

import { storage } from "./storage";

/** The two lists the app shows. */
export type Destination = "store" | "installed";

/**
 * What a skill list is made of: one repository card each, or one skill row
 * each — the rows stacked in one column the switch calls the list.
 */
export type ListUnit = "repo" | "skill";

/**
 * How a list orders itself while no search is live. `popularity` is the
 * registry's blended installs-and-stars figure (`lib/popularity.ts`), the
 * figure every row displays; `installed` is the install's own clock (newest
 * first); `repo` reads the list as repository cards at all, the cards led by
 * the most-starred repository. On the installed list the sort *is* the whole
 * reading — the third option is the shape the unit switch used to pick, merged
 * into this one control — while the store's browse list still reads through its
 * own unit switch and carries no sort of its own.
 */
export type ListSort = "installed" | "popularity" | "repo";

/** One list's own reading: how it is made up, and what it is narrowed to. */
export interface DestinationView {
  unit: ListUnit;
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

/** Both lists read as skill rows — the list — until the reader says otherwise. */
const DEFAULT_UNIT: ListUnit = "skill";
const UNITS: readonly ListUnit[] = ["repo", "skill"];

/** The default order is the figure the rows themselves display: popularity. */
const DEFAULT_SORT: ListSort = "popularity";
const SORTS: readonly ListSort[] = ["popularity", "installed", "repo"];

/** One key per list, so each keeps its own answer under its own name. */
const UNIT_KEY_PREFIX = "skill-one.listUnit.";
const SORT_KEY_PREFIX = "skill-one.listSort.";

function readStoredUnit(destination: Destination): ListUnit {
  const raw = storage.getItem(UNIT_KEY_PREFIX + destination);
  return raw !== null && UNITS.includes(raw as ListUnit)
    ? (raw as ListUnit)
    : DEFAULT_UNIT;
}

function readStoredSort(destination: Destination): ListSort | undefined {
  const raw = storage.getItem(SORT_KEY_PREFIX + destination);
  if (raw !== null && SORTS.includes(raw as ListSort)) {
    // The default stays absent from the view, so a fresh list reads exactly
    // as it did before the control existed.
    return raw === DEFAULT_SORT ? undefined : (raw as ListSort);
  }
  // One-time reading of the choice the unit switch used to hold: a reader who
  // had the installed list in repository cards keeps that reading as the
  // merged control's third sort. The store keeps its unit switch, so its
  // stored unit means nothing here.
  if (
    destination === "installed" &&
    storage.getItem(UNIT_KEY_PREFIX + destination) === "repo"
  ) {
    return "repo";
  }
  return undefined;
}

function storedView(destination: Destination): DestinationView {
  const unit = readStoredUnit(destination);
  const sort = readStoredSort(destination);
  return sort === undefined ? { unit } : { unit, sort };
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
  unit: ListUnit,
  sort: ListSort | undefined,
  scope: string | undefined,
): DestinationView {
  const view: DestinationView = { unit };
  if (sort !== undefined) view.sort = sort;
  if (scope !== undefined) view.scope = scope;
  return view;
}

/**
 * How one list reads. The scope goes with the unit: the two units file their
 * taxonomies differently (a repository's leading domain against a skill's own),
 * so a scope read under one may mean nothing under the other — and leaving it
 * standing would narrow the new unit for a reason the reader never asked for.
 * The sort rides along: how the list orders is not what the unit switch is
 * about, so the reader's choice survives the switch.
 */
export function setUnit(destination: Destination, unit: ListUnit): void {
  const { unit: current, sort } = state.views[destination];
  if (unit === current) return;
  storage.setItem(UNIT_KEY_PREFIX + destination, unit);
  publish({
    ...state,
    views: {
      ...state.views,
      // The scope drops with the unit; only the sort rides along.
      [destination]: buildView(unit, sort, undefined),
    },
  });
}

/**
 * How one list orders itself while no search is live. Like the unit, the
 * choice persists across sessions under the list's own key; unlike the scope,
 * it survives both the unit switch and the chips, because a popularity answer
 * means the same thing in every unit and every slice.
 */
export function setSort(destination: Destination, sort: ListSort): void {
  const { unit, scope, sort: current } = state.views[destination];
  if (sort === current) return;
  if (sort === DEFAULT_SORT) storage.removeItem(SORT_KEY_PREFIX + destination);
  else storage.setItem(SORT_KEY_PREFIX + destination, sort);
  publish({
    ...state,
    views: {
      ...state.views,
      // The default stays absent, exactly as it is never stored.
      [destination]: buildView(
        unit,
        sort === DEFAULT_SORT ? undefined : sort,
        scope,
      ),
    },
  });
}

/** Narrow one list to a scope, or — with `null` — to every scope. */
export function setScope(destination: Destination, scope: string | null): void {
  const { unit, sort, scope: current } = state.views[destination];
  if ((scope ?? undefined) === current) return;
  publish({
    ...state,
    views: {
      ...state.views,
      [destination]: buildView(unit, sort, scope ?? undefined),
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
