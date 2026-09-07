import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  getRegistrySnapshot,
  subscribeRegistry,
  type RegistrySnapshot,
} from "../lib/registry/client";

/**
 * Subscribe to one slice of the registry worker's progress snapshot. The
 * selector output is cached (Object.is) so the calling component only
 * re-renders when the selected value actually changes — progress events keep
 * streaming in every 400ms, but a consumer that only reads `ready`, `error`
 * or `index` no longer re-renders on every count climb the way an unfiltered
 * `useRegistryStats()` subscription would.
 *
 * The selector must return a value that is referentially stable between
 * events when it is semantically unchanged (a primitive, or a memoized
 * object) — the snapshot identity itself only moves on worker events.
 */
export function useRegistrySnapshot<T>(
  selector: (snapshot: RegistrySnapshot) => T,
): T {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeRegistry(onStoreChange),
    [],
  );
  const getSelection = useCallback(
    () => selector(getRegistrySnapshot()),
    [selector],
  );
  const cached = useRef<T | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    const next = getSelection();
    if (!Object.is(cached.current, next)) cached.current = next;
    return cached.current as T;
  }, [getSelection]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}