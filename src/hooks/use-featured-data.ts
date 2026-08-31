import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getFeatured, getRegistrySnapshot, subscribeRegistry } from "../lib/registry/client";
import { useRegistryStats } from "./use-registry-stats";

/** Query key of the featured payload. */
export const FEATURED_DATA_QUERY_KEY = "featured-data";

/**
 * Fully-computed featured payload (hero slides + curated sections) from the
 * registry worker. The query stays disabled until the worker is `ready`,
 * since rankings and curated joins only mean anything against the whole
 * registry — the page keeps its skeleton until then.
 */
export function useFeaturedData() {
  const { ready } = useRegistryStats();
  const queryClient = useQueryClient();
  const seenEpoch = useRef(getRegistrySnapshot().epoch);

  useEffect(() => {
    return subscribeRegistry(() => {
      const { epoch } = getRegistrySnapshot();
      if (epoch !== seenEpoch.current) {
        seenEpoch.current = epoch;
        void queryClient.invalidateQueries({
          queryKey: [FEATURED_DATA_QUERY_KEY],
        });
      }
    });
  }, [queryClient]);

  return useQuery({
    queryKey: [FEATURED_DATA_QUERY_KEY],
    queryFn: getFeatured,
    enabled: ready,
  });
}
