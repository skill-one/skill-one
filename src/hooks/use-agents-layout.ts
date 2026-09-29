import { useCallback, useSyncExternalStore } from "react";

import {
  getAgentsLayout,
  subscribeAgentsLayout,
} from "../lib/agents-layout-preference";

/**
 * The reader's agents-graph layout, reactive to the Advanced Settings
 * control: a change there notifies through the store, so the home graph
 * re-renders with the new presentation instead of waiting for a remount.
 */
export function useAgentsLayout() {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeAgentsLayout(onStoreChange),
    [],
  );
  return useSyncExternalStore(subscribe, getAgentsLayout, getAgentsLayout);
}
