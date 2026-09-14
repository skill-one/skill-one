import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getGroups,
  getRegistrySnapshot,
  subscribeRegistry,
} from "../lib/registry/client";
import type { GroupBy } from "../lib/registry/protocol";

/** Query-key prefix shared by every grouped registry query. */
const REGISTRY_GROUPS_QUERY_PREFIX = "registry-groups";

/**
 * The explore list grouped by the requested mode (no paging — the page folds
 * groups instead), fetched from the worker. The main thread holds the whole
 * answer; closed groups render no cards, so the render cost stays at the
 * expanded groups.
 *
 * While the download streams in, an answer is computed over the loaded prefix
 * (a search stays disabled until the index exists); when the worker's index
 * lands (a new `epoch`), the cached answer is invalidated so it resettles
 * over the full dataset and revalidated data replaces the snapshot in place.
 */
export function useRegistryGroups(query: string, groupBy: GroupBy) {
  const queryClient = useQueryClient();
  const seenEpoch = useRef(getRegistrySnapshot().epoch);
  const seenCount = useRef(getRegistrySnapshot().count);

  useEffect(() => {
    return subscribeRegistry(() => {
      const { epoch, count, complete } = getRegistrySnapshot();
      if (epoch !== seenEpoch.current) {
        seenEpoch.current = epoch;
        seenCount.current = count;
        void queryClient.invalidateQueries({
          queryKey: [REGISTRY_GROUPS_QUERY_PREFIX],
        });
      } else if (!complete && count !== seenCount.current) {
        // While the download streams in, repaint as the loaded prefix grows;
        // the `ready` epoch takes over once the index lands.
        seenCount.current = count;
        void queryClient.invalidateQueries({
          queryKey: [REGISTRY_GROUPS_QUERY_PREFIX],
        });
      }
    });
  }, [queryClient]);

  return useQuery({
    queryKey: [REGISTRY_GROUPS_QUERY_PREFIX, groupBy, query],
    queryFn: () => getGroups({ query, groupBy }),
  });
}
