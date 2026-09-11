import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getPage,
  getRegistrySnapshot,
  subscribeRegistry,
} from "../lib/registry/client";
import type { SortOrder } from "../lib/registry/protocol";

/** Query-key prefix shared by every paged registry query. */
const REGISTRY_PAGE_QUERY_PREFIX = "registry-page";

/**
 * One paged slice of the registry (browse, search, or a single repo's
 * skills), fetched from the worker. Pages are small (one viewport of rows),
 * so the main thread never holds — or re-renders over — the full registry.
 *
 * While the download streams in, an answer is computed over the loaded prefix
 * (browse pages the prefix; search stays disabled until the index exists);
 * when the worker's index lands (a new `epoch`), every cached page is
 * invalidated so answers resettle over the full dataset and revalidated data
 * replaces the snapshot in place.
 */
export function useRegistryPage(
  query: string,
  sort: SortOrder,
  page: number,
  pageSize: number,
  repo?: string,
  domain?: string,
) {
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
          queryKey: [REGISTRY_PAGE_QUERY_PREFIX],
        });
      } else if (!complete && count !== seenCount.current) {
        // While the download streams in, repaint page one as the loaded
        // prefix grows; the `ready` epoch takes over once the index lands.
        seenCount.current = count;
        void queryClient.invalidateQueries({
          queryKey: [REGISTRY_PAGE_QUERY_PREFIX],
        });
      }
    });
  }, [queryClient]);

  return useQuery({
    queryKey: [
      REGISTRY_PAGE_QUERY_PREFIX,
      repo ?? null,
      domain ?? null,
      query,
      sort,
      page,
      pageSize,
    ],
    queryFn: () => getPage({ query, sort, page, pageSize, repo, domain }),
  });
}
