import { useQuery } from "@tanstack/react-query";

import { getGroups } from "../lib/registry/client";
import { useInvalidateOnRegistryEpoch } from "./use-invalidate-on-registry-epoch";
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
 * That is the epoch rule plus the streaming repaint — see the shared hook.
 */
export function useRegistryGroups(query: string, groupBy: GroupBy) {
  useInvalidateOnRegistryEpoch([REGISTRY_GROUPS_QUERY_PREFIX], true);

  return useQuery({
    queryKey: [REGISTRY_GROUPS_QUERY_PREFIX, groupBy, query],
    queryFn: () => getGroups({ query, groupBy }),
  });
}
