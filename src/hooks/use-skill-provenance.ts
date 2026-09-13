import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  getRegistrySnapshot,
  subscribeRegistry,
} from "../lib/registry/client";
import {
  PROVENANCE_QUERY_KEY,
  useInstalledSkills,
} from "./use-installed-skills";
import { reconcileProvenance } from "../lib/provenance";
import type { SkillProvenance } from "../lib/provenance";
import {
  noteRegistryEpoch,
  resolveAssociations,
} from "../lib/link-suggestions";
import type { LinkSuggestions } from "../lib/link-suggestions";
import type { InstalledSkill } from "../lib/skills-manager";

export { PROVENANCE_QUERY_KEY };

/**
 * The full provenance state the UI consumes.
 */
export interface ProvenanceState {
  /**
   * Skills this app associated with a store entry: name → `{repo, slug,
   * installedAt, hash?}`. Covers native installs (recorded at install
   * time), hash-auto-linked tool installs and user confirmations.
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
 * The provenance state for the given installed list, reconciled against it.
 * The tiers run in order: the ledger prune, then (Tauri only — the browser
 * mock has no real files to hash) the content-hash auto-link for unknown
 * skills, then candidate suggestions for whatever remains. Every tier is
 * best-effort; a registry that is not ready yet simply yields fewer
 * suggestions, and the next run retries.
 */
export async function fetchProvenanceState(
  installed: InstalledSkill[],
): Promise<ProvenanceState> {
  const names = installed.map((s) => s.name);
  let linked = await reconcileProvenance(names);

  const unlinked = installed.filter((s) => !linked[s.name]);
  let suggestions: LinkSuggestions = {};
  // The association tiers need the registry (namesakes by slug), so a
  // snapshot that is still streaming skips them wholesale — the next run
  // retries.
  if (unlinked.length > 0 && getRegistrySnapshot().ready) {
    noteRegistryEpoch(getRegistrySnapshot().epoch);
    // Tier 1 — content identity: hash match auto-links (a batched ledger
    // write), the returned names drop out of the candidate pool and the
    // refreshed reconcile below picks the entries up.
    // Tier 2 — ranked namesakes for the user to confirm.
    const resolved = await resolveAssociations(unlinked);
    if (resolved.linked.length > 0) {
      linked = await reconcileProvenance(names);
    }
    suggestions = resolved.suggestions;
  }

  return { linked, suggestions };
}

/**
 * The provenance state, kept in step with two external facts:
 *
 * - **The installed name set** (part of the query key): any change to the
 *   on-disk skills — from any code path, this app or not — lands here and
 *   supersedes the state without anyone remembering to invalidate.
 * - **The registry epoch** (also in the key): the tiers need a ready
   * snapshot, and a new one can carry revs and namesakes the previous one
 *   lacked.
 *
 * `markSkillsChanged` still invalidates the prefix, covering same-name
 * reinstalls where the set does not change but the ledger does.
 */
export function useSkillProvenance() {
  const epoch = useSyncExternalStore(
    subscribeRegistry,
    () => getRegistrySnapshot().epoch,
  );
  const { data: installed } = useInstalledSkills();
  const signature = installed
    ? installed
        .map((s) => s.name)
        .toSorted()
        .join("\u0000")
    : undefined;
  return useQuery({
    queryKey: [...PROVENANCE_QUERY_KEY, epoch, signature],
    queryFn: () => fetchProvenanceState(installed ?? []),
    placeholderData: keepPreviousData,
    enabled: installed != null,
  });
}
