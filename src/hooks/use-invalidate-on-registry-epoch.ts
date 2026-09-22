import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getRegistrySnapshot, subscribeRegistry } from "../lib/registry/client";

/**
 * Drop cached registry-derived queries when the data behind them changes, so
 * the next read refetches against what the worker now serves instead of
 * handing back a stale answer.
 *
 * The trigger is the epoch a full dataset lands with: the cold-start cache, a
 * fresh download, or a revalidation. `whileStreaming` covers the other half of
 * a browsed answer's life — while the download is in flight the answer is
 * computed over the loaded prefix, so every progress count invalidates too.
 * Queries that only mean anything against the whole registry (featured
 * curation, leaderboards) stay off that, since they wait for `ready` anyway.
 */
export function useInvalidateOnRegistryEpoch(
  queryKey: readonly unknown[],
  whileStreaming = false,
) {
  const queryClient = useQueryClient();
  const seenEpoch = useRef(getRegistrySnapshot().epoch);
  const seenCount = useRef(getRegistrySnapshot().count);

  // The latest key is read from a ref instead of the effect's dependencies so
  // callers may build the array inline: re-subscribing on every render would
  // be wasted work, and spreading the array would freeze its length.
  const keyRef = useRef(queryKey);
  useEffect(() => {
    keyRef.current = queryKey;
  });

  useEffect(() => {
    return subscribeRegistry(() => {
      const { epoch, count, complete } = getRegistrySnapshot();
      if (epoch === seenEpoch.current) {
        if (!whileStreaming || complete || count === seenCount.current) return;
      }
      seenEpoch.current = epoch;
      seenCount.current = count;
      void queryClient.invalidateQueries({ queryKey: keyRef.current });
    });
  }, [queryClient, whileStreaming]);
}
