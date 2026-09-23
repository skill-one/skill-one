import { useSyncExternalStore } from "react";

import {
  getListView,
  subscribeListView,
  type Destination,
  type DestinationView,
} from "../lib/list-view";

/**
 * Read the shared list view (see `lib/list-view`). Both selectors return a
 * value the store only replaces when it actually moves — the query is a string,
 * and a destination's view is only re-created when that destination changes —
 * so a header control re-renders neither list's readers.
 */

/** One list's own reading: its unit and its scope. */
export function useDestinationView(destination: Destination): DestinationView {
  const read = () => getListView().views[destination];
  return useSyncExternalStore(subscribeListView, read, read);
}

/** The one query both lists answer. */
export function useListQuery(): string {
  const read = () => getListView().query;
  return useSyncExternalStore(subscribeListView, read, read);
}
