import { useCallback, useSyncExternalStore } from "react";

import {
  getRepoCardLimit,
  subscribeRepoCardLimit,
} from "../lib/repo-card-preview";

/**
 * The reader's repository-card preview size, reactive to the Settings control:
 * a change there notifies through the store, so a list already on screen
 * re-renders with the new cap instead of waiting for a remount.
 */
export function useRepoCardLimit() {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeRepoCardLimit(onStoreChange),
    [],
  );
  return useSyncExternalStore(
    subscribe,
    getRepoCardLimit,
    getRepoCardLimit,
  );
}
