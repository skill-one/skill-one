import { useQuery } from "@tanstack/react-query";

import { isSearchableQuery, searchSkillsSh } from "../lib/skills-sh";

/** Query-key prefix of the live skills.sh search. */
export const SKILLS_SH_SEARCH_QUERY_PREFIX = "skills-sh-search";

/**
 * How long a live answer is reused. Revisiting a search the reader already ran
 * should not re-ask the endpoint, and a five-minute window covers the typing
 * and retyping that happens while a reader refines one question.
 */
const STALE_MS = 5 * 60 * 1000;

/**
 * The live skills.sh search, one query per search text, asked for as soon as a
 * search is live: a reader who typed a question wants the whole answer, so the
 * one cross-network source is no longer gated behind a press.
 *
 * Disabled below the endpoint's own floor, so an empty or one-character field
 * never asks — the query the reader typed is not yet a question the endpoint
 * can answer.
 *
 * Failures are neither retried nor surfaced: the live answer is one group among
 * several, and the local ones stand on their own without it.
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
