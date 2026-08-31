import { useSyncExternalStore } from "react";

import {
  getRegistrySnapshot,
  reloadRegistry,
  subscribeRegistry,
  type RegistrySnapshot,
} from "../lib/registry/client";

/**
 * Progress snapshot of the registry worker: the climbing skill count, the
 * streaming/indexing flags, and a retry for a failed download. Shared by the
 * sidebar badge and the explore page's count row.
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
