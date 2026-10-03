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

/** One list's own reading: its order, its shape and its scope. */
export function useDestinationView(destination: Destination): DestinationView {
  const read = () => getListView().views[destination];
  return useSyncExternalStore(subscribeListView, read, read);
}
