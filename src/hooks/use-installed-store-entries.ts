import { useMemo, useSyncExternalStore } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  getRegistrySnapshot,
  lookupSkills,
  subscribeRegistry,
} from "../lib/registry/client";
import type { SkillProvenance } from "../lib/provenance";
import type { Skill } from "../types/skill";

/** Query-key prefix for the installed list's store-entry lookups. */
export const STORE_ENTRIES_QUERY_KEY = ["installed-store-entries", "v1"] as const;

/** Stable empty result, so a miss never re-renders its consumers. */
const NO_ENTRIES: Record<string, Skill> = {};

/**
 * The registry entries behind the installed skills, keyed by skill name.
 *
 * An on-disk record carries no stars, downloads or profile — those are registry
 * facts — so without this the installed list could only ever render the store's
 * card with the store's figures missing. The lookup runs in the worker (it
 * indexes the registry once and answers every ref from that map), which is why
 * the whole list arrives in a single round-trip instead of one answer per row,
 * and why it stays empty until the index is ready — and in a worker-less test
 * environment, where there is nothing to look up.
 *
 * Only skills the provenance ledger recorded a source for can be looked up: a
 * skill installed by another tool has no repo to resolve, and keeps the
 * local-install presentation.
 */
export function useInstalledStoreEntries(
  linked: Record<string, SkillProvenance> | undefined,
): Record<string, Skill> {
  const snapshot = useSyncExternalStore(
    subscribeRegistry,
    getRegistrySnapshot,
    getRegistrySnapshot,
  );

  const refs = useMemo(
    () =>
      Object.entries(linked ?? {}).map(([name, entry]) => ({
        repo: entry.repo,
        name,
      })),
    [linked],
  );
  // `linked` is a fresh object after every reconcile, so key the query on what
  // the refs actually say: an unchanged list reuses the cached answer instead
  // of re-querying the worker on every refetch of the installed list.
  const signature = refs
    .map((ref) => `${ref.repo}\u0000${ref.name}`)
    .toSorted()
    .join("\u0001");

  const { data } = useQuery({
    queryKey: [...STORE_ENTRIES_QUERY_KEY, snapshot.epoch, signature],
    queryFn: async () => {
      const { entries } = await lookupSkills(refs);
      const found: Record<string, Skill> = {};
      refs.forEach((ref, i) => {
        const entry = entries[i];
        if (entry) found[ref.name] = entry;
      });
      return found;
    },
    enabled: refs.length > 0 && snapshot.ready,
    placeholderData: keepPreviousData,
  });

  return data ?? NO_ENTRIES;
}
