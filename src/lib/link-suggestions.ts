/**
 * Registry-side association for skills the provenance ledger does not know:
 * skills installed by other tools (the `npx skills` CLI, manual copies).
 *
 * Three steps per unlinked skill, ordered cheap-first:
 *
 * 1. **Namesake lookup** — registry entries whose exact slug equals the
 *    skill's name. None? The skill is a plain local skill, nothing more to
 *    do (and, importantly, no disk walk either).
 * 2. **Hash auto-link** — compute the skills.sh upstream content hash of the
 *    local directory and compare it against the namesakes' `rev`s. Equality
 *    is content-level identity, so the association is written into the
 *    ledger exactly like a native install. Computed-but-unmatched hashes
 *    are memoized per registry epoch, so repeated reconcile passes never
 *    re-walk the same directories for nothing.
 * 3. **Description auto-link or candidate suggestions** — the namesakes are
 *    ranked by description similarity. At/above `SIMILARITY_AUTO_LINK_THRESHOLD`
 *    the wording is close enough to call it the same skill, so the association
 *    is written automatically (no prompt). Below the threshold the decision is
 *    left to the user: the ranked candidates are surfaced for confirmation and
 *    nothing is written until they pick one.
 *
 * Namesake lookup goes through the registry worker's search (`searchSkills`,
 * filtered to exact slug equality client-side). When the registry is not ready
 * (still streaming, or a test environment with no worker) every lookup degrades
 * to "no candidates" — the UI then shows the plain local-install presentation.
 */

import type { Skill } from "../types/skill";
import { getRegistrySnapshot, searchSkills } from "./registry/client";
import { computeSkillHash } from "./skills-manager";
import { isTauri } from "./tauri";
import { descriptionSimilarity } from "./description-similarity";
import { recordSkillProvenanceBatch } from "./provenance";

/**
 * Candidates offered for a skill, ranked: any hash-identical entry first
 * (returned by the auto-link tier, not here), then by similarity.
 */
export interface LinkCandidate {
  skill: Skill;
  /** 0–1 description similarity against the installed skill's description. */
  similarity: number;
}

/**
 * Suggestions for skills awaiting user confirmation, keyed by skill name.
 */
export type LinkSuggestions = Record<string, LinkCandidate[]>;

/** Registry entries whose exact slug equals `name`. Empty when unavailable. */
async function findNamesakes(name: string): Promise<Skill[]> {
  // The search index answers only once the registry is ready; before that
  // (and in worker-less test environments) there are simply no candidates.
  if (!getRegistrySnapshot().ready) return [];
  try {
    const { hits } = await searchSkills(name);
    return hits.map((h) => h.skill).filter((s) => s.name === name);
  } catch {
    return [];
  }
}

/** Beyond a few candidates the user is better off searching the store. */
export const MAX_CANDIDATES = 5;

/**
 * Below this description-similarity score (0–1, Jaccard) a namesake is only a
 * *candidate* the user confirms. At or above it the wording is close enough to
 * two skills being the same one — forks rarely keep 90%+ identical
 * descriptions — so the association is written automatically, no prompt.
 */
export const SIMILARITY_AUTO_LINK_THRESHOLD = 0.9;

/**
 * Best description similarity a skill can offer: the local wording may be in
 * either language, so compare against the entry's English description and its
 * Chinese translation (when present) and take the higher score. The displayed
 * percentage and the ranking both read from this.
 */
function bestSimilarity(localDescription: string, skill: Skill): number {
  const byEnglish = descriptionSimilarity(localDescription, skill.description);
  const byChinese = skill.descriptionZh
    ? descriptionSimilarity(localDescription, skill.descriptionZh)
    : 0;
  return Math.max(byEnglish, byChinese);
}

/**
 * Rank prepared namesakes by description similarity, most similar first,
 * capped. No similarity floor: a low score hides nothing — candidates sort
 * to the bottom of the list, and dropping them could hide the one correct
 * repo (e.g. when the local description is missing or worded differently).
 */
export function rankNamesakes(
  namesakes: Skill[],
  localDescription: string,
): LinkCandidate[] {
  return namesakes
    .map((skill) => ({
      skill,
      similarity: bestSimilarity(localDescription, skill),
    }))
    .toSorted((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Resolve every unlinked skill in one pass. Returns the names that were
 * auto-linked (a batched ledger write covers all of them) and the
 * confirmable suggestions for the rest.
 *
 * Per-skill outcomes are memoized for the session (`resolved`): both
 * "no namesakes" and "computed but unmatched" are dead ends until the
 * served snapshot changes, and re-running the pipeline (every install,
 * removal or confirmation) must not re-hash the same directories.
 */
export async function resolveAssociations(
  unlinked: Array<{ name: string; description?: string }>,
): Promise<{ linked: string[]; suggestions: LinkSuggestions }> {
  const linked: string[] = [];
  const matched: Array<{ repo: string; slug: string; hash?: string }> = [];

  // Namesake lookups run in parallel; per-skill outcomes are memoized for
  // the session (`resolved`), so repeated reconcile passes neither re-query
  // the worker nor re-walk skill directories until the snapshot changes.
  await Promise.all(
    unlinked.map(async (skill) => {
      if (resolved.has(skill.name)) return; // dead end or cached candidates

      // Step 1 — the cheap filter: without same-slug entries there is no
      // association to make and no reason to walk the skill's directory.
      const namesakes = await findNamesakes(skill.name);
      if (namesakes.length === 0) {
        resolved.set(skill.name, []);
        return;
      }

      // Step 2 — content identity. The computed hash is only meaningful for
      // the match itself; a matched hash equals the matched rev by
      // definition. Hashing needs the native shell (the browser mock has no
      // real files), so outside Tauri the tier degrades to suggestions only.
      const localHash = !isTauri()
        ? null
        : await computeSkillHash(skill.name).catch(() => null);
      const match =
        localHash != null
          ? namesakes.find((s) => s.rev != null && s.rev === localHash)
          : undefined;
      if (localHash != null && match) {
        matched.push({ repo: match.repo, slug: skill.name, hash: localHash });
        linked.push(skill.name);
        // Linked — the entry leaves the candidate pool for good.
        resolved.set(skill.name, []);
        return;
      }

      // Step 3 — ranked candidates. A near-identical description (≥ threshold)
      // is treated as the same skill and linked without asking; only below the
      // threshold is the decision left to the user, with the candidates cached
      // so the next pass reuses them without another worker round-trip.
      const ranked = rankNamesakes(namesakes, skill.description ?? "");
      const top = ranked[0];
      if (top && top.similarity >= SIMILARITY_AUTO_LINK_THRESHOLD) {
        // No content hash is verified by a description match, so the version
        // marker stays unset — same as a user-confirmed link.
        matched.push({ repo: top.skill.repo, slug: skill.name });
        linked.push(skill.name);
        resolved.set(skill.name, []);
        return;
      }
      resolved.set(skill.name, ranked);
    }),
  );

  if (matched.length > 0) await recordSkillProvenanceBatch(matched);

  // Assemble suggestions from the memoized candidates (linked names were
  // parked with an empty list, so they never appear here).
  const suggestions: LinkSuggestions = {};
  for (const skill of unlinked) {
    const candidates = resolved.get(skill.name);
    if (candidates && candidates.length > 0) {
      suggestions[skill.name] = candidates;
    }
  }
  return { linked, suggestions };
}

/**
 * Per-skill resolution memoization for the current snapshot: `[]` marks a
 * dead end (no namesakes, hashing unavailable) or a linked skill; a
 * non-empty array holds the cached candidates. Cleared when the served
 * snapshot changes — a fresh snapshot can carry the rev a local hash was
 * waiting for, or new namesakes.
 */
const resolved = new Map<string, LinkCandidate[]>();

let lastEpoch = -1;
export function noteRegistryEpoch(epoch: number): void {
  if (epoch !== lastEpoch) {
    resolved.clear();
    lastEpoch = epoch;
  }
}

/** Test hook: clear the memoization between tests. */
export function resetLinkSuggestions(): void {
  resolved.clear();
}
