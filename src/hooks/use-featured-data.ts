import { useQuery } from "@tanstack/react-query";

import { getFeatured } from "../lib/registry/client";
import { useInvalidateOnRegistryEpoch } from "./use-invalidate-on-registry-epoch";
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
  const queryKey = [FEATURED_DATA_QUERY_KEY];
  useInvalidateOnRegistryEpoch(queryKey);

  return useQuery({
    queryKey,
    queryFn: getFeatured,
    enabled: ready,
  });
}
