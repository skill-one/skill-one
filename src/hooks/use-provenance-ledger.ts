import { useQuery } from "@tanstack/react-query";

import { readLedgerRaw } from "../lib/provenance";

/**
 * The TanStack Query cache key for the developer ledger viewer. The ledger is
 * owned by the install/link flows, which never go through this key — the
 * viewer is read-only, so only its own refresh button invalidates it.
 */
export const PROVENANCE_LEDGER_QUERY_KEY = ["provenance-ledger"] as const;

/**
 * The provenance ledger as the developer viewer reads it: raw content directly from disk.
 *
 * `staleTime: 0` like the activity log — the file can be rewritten by any
 * install or link at any time, and the viewer remounts on open, so every
 * opening is a fresh read of a one-small-file.
 */
export function useProvenanceLedger() {
  return useQuery({
    queryKey: PROVENANCE_LEDGER_QUERY_KEY,
    queryFn: readLedgerRaw,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
