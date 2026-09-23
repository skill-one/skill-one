import { useMemo } from "react";

import { useInstalledSkills } from "./use-installed-skills";
import { useSkillProvenance } from "./use-skill-provenance";
import { useInstalledStoreEntries } from "./use-installed-store-entries";
import { buildSearchIndex } from "../lib/search-index";
import { installedSkillView, type SkillView } from "../lib/skill-view";
import type { SkillMatched } from "../components/skill-card";
import type { LinkCandidate } from "../lib/link-suggestions";

/**
 * One installed hit of the unified search view's 本地已安装 section: the
 * on-disk record merged with whatever the ledger and the registry resolve for
 * it, plus the two facts the rendering layer adds per surface (the enable
 * switch, the migration badge) — carried raw here, so the section stays dumb.
 */
export interface InstalledSearchRow {
  skill: SkillView;
  /** Whether the install is enabled; a disabled one renders dimmed. */
  enabled: boolean;
  /** Search-hit highlights, so a searched name reads like the store's. */
  matched?: SkillMatched;
  /** Link candidates for an install no recorded source vouches for. */
  suggestion?: LinkCandidate[];
}

/**
 * The installed list's answer to the shared search query, in the installed
 * index's own relevance order.
 *
 * The same pipeline the installed list browses with — one index over the
 * on-disk records, built in a `useMemo` (installed lists are short, unlike the
 * registry, which builds the same index in the worker), the ledger and the
 * store-entry lookup joined in per row. Only a non-empty query answers; the
 * unified search view renders this section only while a search is live, so an
 * absent query simply answers an empty section.
 */
export function useInstalledSearchRows(query: string): InstalledSearchRow[] {
  const { data: skills } = useInstalledSkills();
  const { data: provenanceState } = useSkillProvenance();
  const linked = provenanceState?.linked;
  const suggestions = provenanceState?.suggestions;
  const storeEntries = useInstalledStoreEntries(linked);

  const list = useMemo(() => skills ?? [], [skills]);
  const search = useMemo(() => buildSearchIndex(list), [list]);
  const hits = useMemo(
    () => (query ? search(query) : null),
    [query, search],
  );

  return useMemo(() => {
    if (!hits) return [];
    return hits.map((hit) => ({
      skill: installedSkillView(hit.doc, linked, storeEntries[hit.doc.name]),
      enabled: hit.doc.enabled,
      matched: hit.matched,
      suggestion: suggestions?.[hit.doc.name],
    }));
  }, [hits, linked, storeEntries, suggestions]);
}
