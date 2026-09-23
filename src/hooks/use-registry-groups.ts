import { useQuery } from "@tanstack/react-query";

import { getGroups } from "../lib/registry/client";
import { useInvalidateOnRegistryEpoch } from "./use-invalidate-on-registry-epoch";

/** Query-key prefix shared by every grouped registry query. */
const REGISTRY_GROUPS_QUERY_PREFIX = "registry-groups";

/**
 * The explore list: one group per repository, fetched from the worker as a
 * whole (no paging — the page reveals it in chunks instead). The main thread
 * holds the answer; the page renders only the chunk it has revealed.
 *
 * While the download streams in, an answer is computed over the loaded prefix
 * (a search stays disabled until the index exists); when the worker's index
 * lands (a new `epoch`), the cached answer is invalidated so it resettles
 * over the full dataset and revalidated data replaces the snapshot in place.
 * That is the epoch rule plus the streaming repaint — see the shared hook.
 *
 * `enabled` lets the explore page stand this query down while browsing (the
 * domain-filed answer, which carries the same repositories) is the one on
 * screen, so the two never fetch together and duplicate the payload.
 */
export function useRegistryGroups(query: string, enabled = true) {
  useInvalidateOnRegistryEpoch([REGISTRY_GROUPS_QUERY_PREFIX], true);

  return useQuery({
    queryKey: [REGISTRY_GROUPS_QUERY_PREFIX, query],
    queryFn: () => getGroups({ query }),
    enabled,
  });
}
