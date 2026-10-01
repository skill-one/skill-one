import { useQuery } from "@tanstack/react-query";

import { ledgerLines, readLedgerRaw } from "../lib/provenance";
import type { LedgerLine } from "../lib/provenance";

/**
 * The TanStack Query cache key for the developer ledger viewer. The ledger is
 * owned by the install/link flows, which never go through this key — the
 * viewer is read-only, so only its own refresh button invalidates it.
 */
export const PROVENANCE_LEDGER_QUERY_KEY = ["provenance-ledger"] as const;

/** The raw ledger text plus its per-line breakdown for the developer viewer. */
export interface ProvenanceLedgerRead {
  raw: string | null;
  lines: LedgerLine[];
}

/**
 * The provenance ledger as the developer viewer reads it: raw content plus
 * the per-line split, no merging or normalization.
 *
 * `staleTime: 0` like the activity log — the file can be rewritten by any
 * install or link at any time, and the viewer remounts on open, so every
 * opening is a fresh read of a one-small-file.
 */
export function useProvenanceLedger() {
  return useQuery({
    queryKey: PROVENANCE_LEDGER_QUERY_KEY,
    queryFn: async (): Promise<ProvenanceLedgerRead> => {
      const raw = await readLedgerRaw();
      return { raw, lines: ledgerLines(raw) };
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
}
