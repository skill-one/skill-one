/**
 * Registry-side association for skills the provenance ledger does not know:
 * skills installed by other tools (the `npx skills` CLI, manual copies).
 *
 * Two tiers, by rising effort and falling certainty:
 *
 * 1. **Hash auto-link** — the skills.sh upstream content hash of the local
 *    skill directory equals a registry entry's `rev`. Content-level identity,
 *    so the association is written straight into the ledger, exactly like a
 *    native install. Misses are expected when the local copy's version
 *    differs from the indexed snapshot, or the mirror omitted files — those
 *    skills fall to tier 2. Per-session misses are memoized so the reconcile
 *    query never re-hashes (and re-asks the worker for) known dead ends.
 *
 * 2. **Candidate suggestions** — same-slug registry entries ranked by
 *    description similarity. A description alone cannot prove identity (forks
 *    share wording), so suggestions are only offered to the user for explicit
 *    confirmation, never written automatically.
 *
 * Namesake lookup goes through the registry worker's search (`getPage` with
 * the skill name, filtered to exact slug equality client-side). When the
 * registry is not ready (still streaming, or a test environment with no
 * worker) every lookup degrades to "no candidates" — the UI then shows the
 * plain local-install presentation.
 */

import type { Skill } from "../types/skill";
import { getPage, getRegistrySnapshot } from "./registry/client";
import { computeSkillHash } from "./skills-manager";
import { descriptionSimilarity } from "./description-similarity";
import { recordSkillProvenance } from "./provenance";

/** One confirmable association candidate: a namesake and how similar it looks. */
export interface LinkCandidate {
  skill: Skill;
  /** 0–1 description similarity against the installed skill's description. */
  similarity: number;
}

/**
 * Candidates offered for a skill, ranked: any hash-identical entry first
 * (returned by the auto-link tier, not here), then by similarity.
 */
export type LinkSuggestions = Record<string, LinkCandidate[]>;

/** Registry entries whose exact slug equals `name`. Empty when unavailable. */
async function findNamesakes(name: string): Promise<Skill[]> {
  // The search index answers only once the registry is ready; before that
  // (and in worker-less test environments) there are simply no candidates.
  if (!getRegistrySnapshot().ready) return [];
  try {
    const page = await getPage({
      query: name,
      sort: "default",
      page: 0,
      // A slug is shared by at most a handful of repos; one page is plenty.
      pageSize: 50,
    });
    return page.hits.map((h) => h.skill).filter((s) => s.name === name);
  } catch {
    return [];
  }
}

/**
 * Tier 1: auto-link installed skills whose content hash matches a registry
 * entry's `rev`. Returns the names that were linked (a ledger write per
 * link); misses are memoized for the session. Errors never propagate — the
 * hash tier is pure optimization over the ledger.
 */
export async function autoLinkByHash(
  unlinked: Array<{ name: string; description?: string }>,
): Promise<string[]> {
  const linked: string[] = [];
  for (const skill of unlinked) {
    if (hashMisses.has(skill.name)) continue;
    // computeSkillHash already degrades errors to null; the catch is a
    // second belt for anything unexpected.
    const localHash = await computeSkillHash(skill.name).catch(() => null);
    if (!localHash) {
      hashMisses.add(skill.name);
      continue;
    }
    const match = (await findNamesakes(skill.name)).find(
      (s) => s.rev != null && s.rev === localHash,
    );
    if (match) {
      await recordSkillProvenance(match.repo, skill.name);
      linked.push(skill.name);
    } else {
      hashMisses.add(skill.name);
    }
  }
  return linked;
}

/** Names whose hash tier already came up empty this session. */
const hashMisses = new Set<string>();

/**
 * Forget memoized misses when the served snapshot changed: a fresh snapshot
 * can carry the rev a local hash was waiting for, or new namesakes. Called
 * by the reconcile query with the registry epoch it observed.
 */
let lastEpoch = -1;
export function noteRegistryEpoch(epoch: number): void {
  if (epoch !== lastEpoch) {
    hashMisses.clear();
    lastEpoch = epoch;
  }
}

/** Test hook: clear the miss memoization between tests. */
export function resetLinkSuggestions(): void {
  hashMisses.clear();
}

/**
 * Tier 2: rank a skill's namesakes by description similarity. Only entries
 * scoring at least {@link MIN_SIMILARITY} are offered, capped at
 * {@link MAX_CANDIDATES} — beyond a few the user is better off searching the
 * store than picking from a long list.
 */
export const MIN_SIMILARITY = 0.3;
export const MAX_CANDIDATES = 5;

export async function rankCandidates(
  name: string,
  localDescription: string,
): Promise<LinkCandidate[]> {
  const candidates = (await findNamesakes(name))
    .map((skill) => ({
      skill,
      similarity: descriptionSimilarity(localDescription, skill.description),
    }))
    .filter((c) => c.similarity >= MIN_SIMILARITY)
    .toSorted((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CANDIDATES);
  return candidates;
}

/**
 * Suggestions for every unlinked skill at once (one namesake lookup per
 * name — cheap worker queries over the cached index, re-run per invalidate
 * since new snapshots can carry new namesakes). Skills the hash tier just
 * linked are excluded via `skipNames`.
 */
export async function buildSuggestions(
  unlinked: Array<{ name: string; description?: string }>,
  skipNames: ReadonlySet<string>,
): Promise<LinkSuggestions> {
  const suggestions: LinkSuggestions = {};
  for (const skill of unlinked) {
    if (skipNames.has(skill.name)) continue;
    const candidates = await rankCandidates(
      skill.name,
      skill.description ?? "",
    );
    if (candidates.length > 0) suggestions[skill.name] = candidates;
  }
  return suggestions;
}
