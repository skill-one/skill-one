import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  getRegistrySnapshot,
  subscribeRegistry,
} from "../lib/registry/client";
import {
  installedSignature,
  PROVENANCE_QUERY_KEY,
  useInstalledSkills,
} from "./use-installed-skills";
import { reconcileProvenance } from "../lib/provenance";
import type { SkillProvenance } from "../lib/provenance";
import { logSkillDiscoveries } from "../lib/activity";
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
   * Skills this app associated with a store entry: name → `{repo, via?}`.
   * Covers native installs, auto-linked tool installs and user confirmations.
   */
  linked: Record<string, SkillProvenance>;
  /**
   * Confirmable candidates for the remaining skills: name → namesakes ranked
   * by description similarity. Absent for skills with no plausible namesake —
   * those keep the plain local-install presentation.
   */
  suggestions: LinkSuggestions;
  /**
   * Repos the user cut, per skill. A cut keeps its repo on the candidate list
   * — re-picking it is the user's own act of re-identification — so the
   * surfaces that offer the list mark it: a repo the user already refused reads
   * as new again otherwise.
   */
  cut: Record<string, string[]>;
}

/**
 * The provenance state for the given installed list, reconciled against it.
 * The tiers run in order: the ledger prune, then the association pass over
 * whatever the ledger does not know (auto-linking a near-identical namesake,
 * offering the rest for confirmation). Every tier is best-effort; a registry
 * that is not ready yet simply yields fewer suggestions, and the next run
 * retries.
 */
export async function fetchProvenanceState(
  installed: InstalledSkill[],
): Promise<ProvenanceState> {
  const names = installed.map((s) => s.name);
  let { sources: linked, cut, emptyRepos } = await reconcileProvenance(names);

  // Exclude skills that are already linked or explicitly marked with repo === ""
  const unlinked = installed.filter(
    (s) => !linked[s.name] && !emptyRepos?.has(s.name),
  );
  let suggestions: LinkSuggestions = {};
  // The association tiers need the registry (namesakes by slug), so a
  // snapshot that is still streaming skips them wholesale — the next run
  // retries.
  if (unlinked.length > 0 && getRegistrySnapshot().ready) {
    noteRegistryEpoch(getRegistrySnapshot().epoch);
    // One pass over the unlinked names: a near-identical namesake is linked
    // outright (a batched ledger write), the rest come back as ranked
    // candidates for the user to confirm. The refreshed reconcile below picks
    // the new entries up.
    const resolved = await resolveAssociations(unlinked);
    if (resolved.linked.length > 0) {
      ({ sources: linked, cut, emptyRepos } = await reconcileProvenance(names));
    }
    suggestions = resolved.suggestions;
  }

  // Report skills the app has never accounted for — the "scan" events. A
  // no-op after the first pass (which adopts the current set as the baseline)
  // and for anything the app itself installed.
  await logSkillDiscoveries(names, (name) => linked[name] != null);

  return { linked, suggestions, cut };
}

/**
 * The provenance state, kept in step with two external facts:
 *
 * - **The installed name set** (part of the query key): any change to the
 *   on-disk skills — from any code path, this app or not — lands here and
 *   supersedes the state without anyone remembering to invalidate.
 * - **The registry epoch** (also in the key): the association pass needs a
 *   ready snapshot, and a new one can carry namesakes the previous one lacked.
 *   The epoch is a per-process counter, so it only orders the passes within one
 *   run; whether a *stored* ranking may be reused is decided by the snapshot
 *   identity in the ledger header, not by this number.
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
  // The list's own signature, derived once per list rather than once per reader
  // of it (see `factsOf`): a page of rows mounting this hook must not sort the
  // installed list once per row.
  const signature = installedSignature(installed);
  return useQuery({
    queryKey: [...PROVENANCE_QUERY_KEY, epoch, signature],
    queryFn: () => fetchProvenanceState(installed ?? []),
    placeholderData: keepPreviousData,
    enabled: installed != null,
  });
}
