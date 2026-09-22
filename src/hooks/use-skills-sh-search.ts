import { useQuery } from "@tanstack/react-query";

import { isSearchableQuery, searchSkillsSh } from "../lib/skills-sh";

/** Query-key prefix of the live skills.sh search. */
export const SKILLS_SH_SEARCH_QUERY_PREFIX = "skills-sh-search";

/**
 * How long a live answer is reused. The section supplements the store, so
 * revisiting a search the reader already ran should not re-ask the endpoint.
 */
const STALE_MS = 5 * 60 * 1000;

/**
 * The store's live skills.sh search, one query per search text. Disabled below
 * the endpoint's own floor, so an empty or one-character field never asks.
 *
 * Failures are neither retried nor surfaced: the live answer is a supplement,
 * and the local one stands on its own without it.
 */
export function useSkillsShSearch(query: string) {
  return useQuery({
    queryKey: [SKILLS_SH_SEARCH_QUERY_PREFIX, query],
    queryFn: ({ signal }) => searchSkillsSh(query, signal),
    enabled: isSearchableQuery(query),
    staleTime: STALE_MS,
    retry: false,
  });
}
