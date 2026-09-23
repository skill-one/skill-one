import { useSyncExternalStore } from "react";

import {
  getRegistrySnapshot,
  reloadRegistry,
  subscribeRegistry,
  type RegistrySnapshot,
} from "../lib/registry/client";

/**
 * Progress snapshot of the registry worker: the climbing skill count, the
 * streaming/indexing flags, and a retry for a failed download. The explore
 * page's count row reads it; a consumer that wants one flag out of it should
 * subscribe to that flag alone (`useRegistrySnapshot`), so a climbing count
 * does not re-render it.
 */
export function useRegistryStats(): RegistrySnapshot & {
  /** Re-download the registry (user-facing retry). */
  refetch: () => void;
} {
  const snapshot = useSyncExternalStore(
    subscribeRegistry,
    getRegistrySnapshot,
    getRegistrySnapshot,
  );
  return { ...snapshot, refetch: reloadRegistry };
}
