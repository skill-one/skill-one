import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getRegistrySnapshot, subscribeRegistry } from "../lib/registry/client";

/**
 * Drop cached registry-derived queries whenever a full dataset lands (cold
 * start, fresh download, revalidation), so their next mount refetches
 * against the new registry instead of serving a stale answer.
 *
 * Shared by the queries that only mean anything against the whole registry —
 * featured curation and leaderboards. Queries that also track the streaming
 * download (paged browse/search) keep their own subscription, since their
 * invalidation rule is broader.
 */
export function useInvalidateOnRegistryEpoch(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const seenEpoch = useRef(getRegistrySnapshot().epoch);

  // The latest key is read from a ref instead of the effect's dependencies so
  // callers may build the array inline: re-subscribing on every render would
  // be wasted work, and spreading the array would freeze its length.
  const keyRef = useRef(queryKey);
  useEffect(() => {
    keyRef.current = queryKey;
  });

  useEffect(() => {
    return subscribeRegistry(() => {
      const { epoch } = getRegistrySnapshot();
      if (epoch !== seenEpoch.current) {
        seenEpoch.current = epoch;
        void queryClient.invalidateQueries({ queryKey: keyRef.current });
      }
    });
  }, [queryClient]);
}
