import { useQuery } from "@tanstack/react-query";

import { getRanking } from "../lib/registry/client";
import { rankingById } from "../lib/registry/featured-rankings";
import { useInvalidateOnRegistryEpoch } from "./use-invalidate-on-registry-epoch";
import { useRegistryStats } from "./use-registry-stats";

/** Query-key prefix shared by every leaderboard query. */
export const RANKING_QUERY_PREFIX = "ranking";

/**
 * One leaderboard, fully ranked inside the registry worker. Like the featured
 * payload, the query stays disabled until the worker is `ready` — a ranking
 * over a partial download would be wrong.
 *
 * An unknown `rankingId` disables the query instead of asking the worker for
 * a leaderboard that does not exist; the page reports it as a missing
 * leaderboard without ever going through a failed request.
 */
export function useRanking(rankingId: string | undefined) {
  const { ready } = useRegistryStats();
  const def = rankingId ? rankingById(rankingId) : undefined;
  const queryKey = [RANKING_QUERY_PREFIX, rankingId];
  useInvalidateOnRegistryEpoch(queryKey);

  return useQuery({
    queryKey,
    // Only ever called while `enabled`, i.e. with a known leaderboard.
    queryFn: () => getRanking({ rankingId: def!.id }),
    enabled: ready && def != null,
  });
}
