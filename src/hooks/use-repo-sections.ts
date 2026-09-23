import { useQuery } from "@tanstack/react-query";

import { getRepoSections } from "../lib/registry/client";
import { useInvalidateOnRegistryEpoch } from "./use-invalidate-on-registry-epoch";

/** Query-key prefix of the domain-filed repository query. */
const REGISTRY_SECTIONS_QUERY_PREFIX = "registry-sections";

/**
 * The repository browse answer, filed by domain: one section per domain, every
 * repository card under its leading domain, fetched from the worker as a whole
 * (the page reveals it in chunks instead of paging it). The explore page's
 * domain filter reads it — the sections are the filter's chips, and one section
 * is the list a chip scopes to.
 *
 * `enabled` keeps the query off while a search is live: the two answers carry
 * the same repositories, so fetching both would duplicate the payload. While
 * the download streams in the answer is computed over the loaded prefix and
 * invalidated as it grows — the same epoch rule the grouped query follows.
 */
export function useRepoSections(enabled = true) {
  useInvalidateOnRegistryEpoch([REGISTRY_SECTIONS_QUERY_PREFIX], true);

  return useQuery({
    queryKey: [REGISTRY_SECTIONS_QUERY_PREFIX],
    queryFn: () => getRepoSections(),
    enabled,
  });
}
