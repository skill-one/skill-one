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
 * 3. **Candidate suggestions** — the same namesakes ranked by description
 *    similarity and surfaced for the user to confirm. A description alone
 *    cannot prove identity (forks share wording), so nothing is written
 *    until the user picks one.
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

/** Only entries scoring at least this similar are offered as candidates. */
export const MIN_SIMILARITY = 0.3;

/** Beyond a few candidates the user is better off searching the store. */
export const MAX_CANDIDATES = 5;

/** Rank prepared namesakes by description similarity, filtered and capped. */
export function rankNamesakes(
  namesakes: Skill[],
  localDescription: string,
): LinkCandidate[] {
  return namesakes
    .map((skill) => ({
      skill,
      similarity: descriptionSimilarity(localDescription, skill.description),
    }))
    .filter((c) => c.similarity >= MIN_SIMILARITY)
    .toSorted((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Resolve every unlinked skill in one pass. Returns the names that were
 * auto-linked (a batched ledger write covers all of them) and the
 * confirmable suggestions for the rest.
 *
 * Per-skill outcomes are memoized for the session (`resolvedNames`): both
 * "no namesakes" and "computed but unmatched" are dead ends until the
 * served snapshot changes, and re-running the pipeline (every install,
 * removal or confirmation) must not re-hash the same directories.
 */
export async function resolveAssociations(
  unlinked: Array<{ name: string; description?: string }>,
): Promise<{ linked: string[]; suggestions: LinkSuggestions }> {
  const linked: string[] = [];
  const matched: Array<{ repo: string; slug: string; hash: string }> = [];
  const suggestions: LinkSuggestions = {};

  for (const skill of unlinked) {
    // Step 1 — the cheap filter: without same-slug entries there is no
    // association to make and no reason to walk the skill's directory.
    const namesakes = await findNamesakes(skill.name);
    if (namesakes.length === 0) {
      resolvedNames.add(skill.name);
      continue;
    }

    // Step 2 — content identity. The computed hash is only meaningful for
    // the match itself; a matched hash equals the matched rev by definition.
    // Hashing needs the native shell (the browser mock has no real files),
    // so outside Tauri the tier degrades to suggestions only.
    const localHash =
      resolvedNames.has(skill.name) || !isTauri()
        ? null
        : await computeSkillHash(skill.name).catch(() => null);
    const match =
      localHash != null
        ? namesakes.find((s) => s.rev != null && s.rev === localHash)
        : undefined;
    if (localHash != null && match) {
      matched.push({ repo: match.repo, slug: skill.name, hash: localHash });
      linked.push(skill.name);
      continue;
    }
    // Dead end this epoch — hash failed/skipped, or computed but unmatched.
    resolvedNames.add(skill.name);

    // Step 3 — ranked candidates for the user to confirm.
    const candidates = rankNamesakes(namesakes, skill.description ?? "");
    if (candidates.length > 0) suggestions[skill.name] = candidates;
  }

  if (matched.length > 0) await recordSkillProvenanceBatch(matched);
  return { linked, suggestions };
}

/**
 * Skill names already resolved to a dead end this session ("no namesakes"
 * or "hash computed but unmatched"). Cleared when the served snapshot
 * changes — a fresh snapshot can carry the rev a local hash was waiting
 * for, or new namesakes.
 */
const resolvedNames = new Set<string>();

let lastEpoch = -1;
export function noteRegistryEpoch(epoch: number): void {
  if (epoch !== lastEpoch) {
    resolvedNames.clear();
    lastEpoch = epoch;
  }
}

/** Test hook: clear the memoization between tests. */
export function resetLinkSuggestions(): void {
  resolvedNames.clear();
}
