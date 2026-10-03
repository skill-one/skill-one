import { useSyncExternalStore } from "react";

import {
  getListView,
  subscribeListView,
  type Destination,
  type DestinationView,
} from "../lib/list-view";

/**
 * Read the shared list view (see `lib/list-view`). The selector returns a value
 * the store only replaces when it actually moves — and a destination's view is
 * only re-created when that destination changes — so a list's readers do not
 * re-render over another destination's edits.
 */

/** One list's own reading: its question, its order, its shape and its scope. */
export function useDestinationView(destination: Destination): DestinationView {
  const read = () => getListView().views[destination];
  return useSyncExternalStore(subscribeListView, read, read);
}

/**
 * What one list is being asked for, as typed (see `setQuery`). Empty is the
 * absent question, so the field's controlled value never has to know about the
 * store's own absent-by-default shape.
 *
 * Read through the same destination view rather than off a field of its own, so
 * one subscription carries the whole answer: a list's readers re-render when
 * that list moves, and not when the other one does.
 */
export function useListQuery(destination: Destination): string {
  const { query } = useDestinationView(destination);
  return query ?? "";
}
