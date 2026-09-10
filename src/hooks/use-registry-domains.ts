import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getDomains,
  getRegistrySnapshot,
  subscribeRegistry,
} from "../lib/registry/client";

/** Query-key prefix shared by the domains query. */
const REGISTRY_DOMAINS_QUERY_KEY = "registry-domains";

/**
 * The distinct profile domains with their skill counts, for the explore
 * toolbar's category filter. Fetched from the worker (the main thread never
 * touches the registry) and invalidated on every `ready` epoch, so the list
 * settles once the index — decorated with the profiles dataset — lands.
 * An empty list simply hides the filter; a missing profiles dataset is not
 * an error state.
 */
export function useRegistryDomains() {
  const queryClient = useQueryClient();
  const seenEpoch = useRef(getRegistrySnapshot().epoch);

  useEffect(() => {
    return subscribeRegistry(() => {
      const { epoch } = getRegistrySnapshot();
      if (epoch !== seenEpoch.current) {
        seenEpoch.current = epoch;
        void queryClient.invalidateQueries({
          queryKey: [REGISTRY_DOMAINS_QUERY_KEY],
        });
      }
    });
  }, [queryClient]);

  return useQuery({
    queryKey: [REGISTRY_DOMAINS_QUERY_KEY],
    queryFn: getDomains,
    staleTime: 10 * 60 * 1000,
    gcTime: Infinity,
    retry: false,
  });
}
