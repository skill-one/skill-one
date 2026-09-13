import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  getRegistrySnapshot,
  subscribeRegistry,
} from "../lib/registry/client";

import { fetchInstalledSkills } from "../lib/local-skills";
import { reconcileProvenance } from "../lib/provenance";
import type { SkillProvenance } from "../lib/provenance";
import {
  autoLinkByHash,
  buildSuggestions,
  noteRegistryEpoch,
} from "../lib/link-suggestions";
import type { LinkSuggestions } from "../lib/link-suggestions";
import { isTauri } from "../lib/tauri";

/**
 * The TanStack Query cache key for the provenance state. Invalidated by
 * `markSkillsChanged` together with the installed-skills list, since both
 * change on the same events (install / remove).
 */
export const PROVENANCE_QUERY_KEY = ["skill-provenance"] as const;

/** The full provenance state the UI consumes. */
export interface ProvenanceState {
  /**
   * Skills this app associated with a store entry: name → `{repo, slug,
   * installedAt}`. Covers native installs (recorded at install time) and
   * hash-auto-linked tool installs; user confirmations land here too.
   */
  linked: Record<string, SkillProvenance>;
  /**
   * Confirmable candidates for the remaining skills: name → namesakes ranked
   * by description similarity. Absent for skills with no plausible namesake —
   * those keep the plain local-install presentation.
   */
  suggestions: LinkSuggestions;
}

/**
 * The provenance state for installed skills, reconciled against the on-disk
 * list on every fetch. The tiers run in order: the ledger prune, then (Tauri
 * only — the browser mock has no real files to hash) the content-hash
 * auto-link for unknown skills, then candidate suggestions for whatever
 * remains. Every tier is best-effort; a registry that is not ready yet simply
 * yields fewer suggestions, and the next invalidation retries.
 */
export function useSkillProvenance() {
  // The registry epoch joins the query key: the tiers only run once the
  // snapshot is ready, so the boot-time run (registry still streaming) must
  // be superseded the moment `ready` flips — and again on every revalidation
  // that serves a new snapshot (new snapshot → possibly new namesakes).
  // markSkillsChanged still invalidates by the shared prefix.
  const epoch = useSyncExternalStore(
    subscribeRegistry,
    (snapshot) => snapshot.epoch,
  );
  return useQuery({
    queryKey: [...PROVENANCE_QUERY_KEY, epoch],
    queryFn: fetchProvenanceState,
    placeholderData: keepPreviousData,
  });
}

/** The query body, standalone for direct testing. */
export async function fetchProvenanceState(): Promise<ProvenanceState> {
  const installed = await fetchInstalledSkills();
  const names = installed.map((s) => s.name);
  let linked = await reconcileProvenance(names);

  const unlinked = installed.filter((s) => !linked[s.name]);
  let suggestions: LinkSuggestions = {};
  // Both tiers need the registry (namesakes by slug), so a snapshot that is
  // still streaming skips them wholesale — the next invalidation retries.
  if (unlinked.length > 0 && getRegistrySnapshot().ready) {
    noteRegistryEpoch(getRegistrySnapshot().epoch);
    // Tier 1 — content identity: hash match auto-links, ledger entries
    // are written and the returned names drop out of the candidate pool.
    const autoLinked = isTauri() ? await autoLinkByHash(unlinked) : [];
    if (autoLinked.length > 0) {
      linked = await reconcileProvenance(names);
    }
    // Tier 2 — ranked namesakes for the user to confirm.
    suggestions = await buildSuggestions(unlinked, new Set(autoLinked));
  }

  return { linked, suggestions };
}
