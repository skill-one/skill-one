import { useQuery } from "@tanstack/react-query";

import { getDomains } from "../lib/registry/client";
import { useInvalidateOnRegistryEpoch } from "./use-invalidate-on-registry-epoch";

/** Query-key prefix shared by the domains query. */
const REGISTRY_DOMAINS_QUERY_KEY = "registry-domains";

/**
 * The distinct profile domains with their skill counts, for the explore
 * toolbar's category filter. Fetched from the worker (the main thread never
 * touches the registry) and invalidated on every `ready` epoch, so the list
 * settles once the index — decorated with the profiles dataset — lands.
 * An empty list simply hides the filter; a missing profiles dataset is not
 * an error state. Query options come from the shared QueryClient defaults
 * (see `lib/query-client`).
 */
export function useRegistryDomains() {
  useInvalidateOnRegistryEpoch([REGISTRY_DOMAINS_QUERY_KEY]);
  return useQuery({
    queryKey: [REGISTRY_DOMAINS_QUERY_KEY],
    queryFn: getDomains,
  });
}
