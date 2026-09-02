import { useEffect, useRef } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { getRepos, getRegistrySnapshot, subscribeRegistry } from "../lib/registry/client";
import type { ReposRequest } from "../lib/registry/protocol";
import { useRegistryStats } from "./use-registry-stats";

/** Query-key prefix shared by every paged repos query. */
const REGISTRY_REPOS_QUERY_PREFIX = "registry-repos";

/**
 * One paged slice of the per-repo aggregation, fetched from the worker.
 *
 * The query stays disabled until the worker is `ready`: a repo's skill
 * count computed over a partially downloaded index is simply wrong, so the
 * page keeps its skeleton until the whole registry has landed (unlike the
 * progressive explore page). Revalidated datasets bump the snapshot's
 * `epoch`, which invalidates every cached page.
 */
export function useRegistryRepos(
  query: string,
  sort: ReposRequest["sort"],
  page: number,
  pageSize: number,
) {
  const { ready } = useRegistryStats();
  const queryClient = useQueryClient();
  const seenEpoch = useRef(getRegistrySnapshot().epoch);

  useEffect(() => {
    return subscribeRegistry(() => {
      const { epoch } = getRegistrySnapshot();
      if (epoch !== seenEpoch.current) {
        seenEpoch.current = epoch;
        void queryClient.invalidateQueries({
          queryKey: [REGISTRY_REPOS_QUERY_PREFIX],
        });
      }
    });
  }, [queryClient]);

  return useQuery({
    queryKey: [REGISTRY_REPOS_QUERY_PREFIX, query, sort, page, pageSize],
    queryFn: () => getRepos({ query, sort, page, pageSize }),
    enabled: ready,
    // While the next page is in flight, keep serving the previous one: the
    // total must not collapse to 0 (which would clamp the page number back
    // to 1) and the grid should not flash empty between page turns.
    placeholderData: keepPreviousData,
  });
}
