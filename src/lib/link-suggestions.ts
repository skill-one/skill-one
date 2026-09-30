/**
 * Registry-side association for skills the provenance ledger does not know:
 * skills installed by other tools (the `npx skills` CLI, manual copies).
 *
 * Two steps per unlinked skill, ordered cheap-first:
 *
 * 1. **Namesake lookup** — registry entries whose exact slug equals the
 *    skill's name. None? The skill is a plain local skill, nothing more to
 *    do (and, importantly, no disk walk either).
 * 2. **Description auto-link or candidate suggestions** — the namesakes are
 *    ranked by description similarity. At/above `SIMILARITY_AUTO_LINK_THRESHOLD`
 *    the wording is close enough to call it the same skill, so the association
 *    is written automatically (no prompt). Below the threshold the decision is
 *    left to the user: the ranked candidates are surfaced for confirmation and
 *    nothing is written until they pick one.
 *
 * Every outcome is cached at two levels so the work is paid once, not per
 * reconcile pass or app restart:
 *
 * - **Session memo** (`resolved`): cleared when the served snapshot changes.
 * - **Ledger** (`ResolutionRecord` in `.skill-one.jsonl`, persisted): the
 *   namesake verdict is stamped with the snapshot `epoch`, the computed hash
 *   is guarded by a stat-only directory `fingerprint`, and the ranked
 *   candidates carry the equality key of their ranking input. A restart thus
 *   re-runs nothing while snapshot and content are unchanged; a new snapshot
 *   only re-runs the cheap lookup, reusing the stored hash for matching.
 *
 * Namesake lookup goes through the registry worker's search (`searchSkills`,
 * filtered to exact slug equality client-side). When the registry is not ready
 * (still streaming, or a test environment with no worker) every lookup degrades
 * to "no candidates" — the UI then shows the plain local-install presentation.
 */

import type { Skill } from "../types/skill";
import { getRegistrySnapshot, searchSkills } from "./registry/client";
import { analyzeSkill, skillFingerprint } from "./skills-manager";
import { isTauri } from "./tauri";
import { descriptionSimilarity } from "./description-similarity";
import {
  loadResolutionRecords,
  recordSkillProvenanceBatch,
  saveResolutionRecords,
} from "./provenance";
import type {
  PersistedCandidate,
  ResolutionRecord,
  SkillFingerprint,
} from "./provenance";
import type { SourceLinkReason } from "./activity";

/**
 * Candidates offered for a skill, ranked by description similarity.
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
 * Equality key of a ranking input: the full namesake list's identity fields
 * (the repo and the descriptions the similarity reads). A fresh lookup with
 * the same key ranks identically over unchanged content.
 */
function namesakesKey(namesakes: Skill[]): string {
  return namesakes
    .map((s) => [s.repo, s.description, s.descriptionZh ?? ""].join("\u0000"))
    .toSorted()
    .join("\u0001");
}

function toPersisted(candidate: LinkCandidate): PersistedCandidate {
  const { skill, similarity } = candidate;
  return {
    repo: skill.repo,
    similarity,
    stars: skill.stars,
    downloads: skill.downloads,
    description: skill.description,
    ...(skill.descriptionZh !== undefined ? { descriptionZh: skill.descriptionZh } : {}),
  };
}

function reviveCandidates(name: string, candidates: PersistedCandidate[]): LinkCandidate[] {
  return candidates.map((candidate) => ({
    similarity: candidate.similarity,
    skill: {
      name,
      repo: candidate.repo,
      description: candidate.description,
      stars: candidate.stars,
      downloads: candidate.downloads,
      ...(candidate.descriptionZh !== undefined ? { descriptionZh: candidate.descriptionZh } : {}),
    },
  }));
}

function sameFingerprint(a: SkillFingerprint, b: SkillFingerprint): boolean {
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

/**
 * Resolve every unlinked skill in one pass. Returns the names that were
 * auto-linked (batched ledger writes cover all of them) and the confirmable
 * suggestions for the rest.
 *
 * Per-skill outcomes are memoized for the session (`resolved`) and persisted
 * in the ledger, so repeated reconcile passes — and app restarts — neither
 * re-query the worker nor re-walk skill directories until the served snapshot
 * or the skill's content changes.
 */
export async function resolveAssociations(
  unlinked: Array<{ name: string; description?: string }>,
): Promise<{ linked: string[]; suggestions: LinkSuggestions }> {
  const epoch = getRegistrySnapshot().epoch;
  const stored = await loadResolutionRecords();
  const linked: string[] = [];
  const matched: Array<{
    repo: string;
    name: string;
    reason: SourceLinkReason;
  }> = [];
  const upserts = new Map<string, ResolutionRecord>();
  const drops = new Set<string>();

  await Promise.all(
    unlinked.map(async (skill) => {
      if (resolved.has(skill.name)) return; // dead end or cached candidates

      const cached = stored[skill.name];
      if (cached && cached.epoch === epoch) {
        // Already verified against this snapshot. A dead end is
        // content-independent — "no namesakes" cannot change until the
        // snapshot does. Candidates are content-dependent (the ranking reads
        // the local description), so their reuse revalidates the fingerprint.
        if (!cached.candidates?.length) {
          resolved.set(skill.name, []);
          return;
        }
        if (!isTauri()) {
          resolved.set(skill.name, reviveCandidates(skill.name, cached.candidates));
          return;
        }
        if (cached.fingerprint) {
          const fingerprint = await skillFingerprint(skill.name);
          if (fingerprint && sameFingerprint(fingerprint, cached.fingerprint)) {
            resolved.set(skill.name, reviveCandidates(skill.name, cached.candidates));
            return;
          }
        }
        // Stale content or no fingerprint to check — fall through and redo.
      }

      // Step 1 — the cheap filter: without same-slug entries there is no
      // association to make and no reason to walk the skill's directory.
      const namesakes = await findNamesakes(skill.name);
      if (namesakes.length === 0) {
        resolved.set(skill.name, []);
        upserts.set(skill.name, { name: skill.name, epoch, candidates: [] });
        return;
      }

      // Step 2 — content check. The directory is analyzed (hash +
      // fingerprint in one walk) so the ledger can guard the ranking by the
      // stat-only fingerprint: a stored hash reused while the fingerprint
      // says the directory is unchanged lets a restart skip re-ranking. The
      // registry no longer publishes per-skill hashes, so the hash itself
      // matches nothing — it is bookkeeping, not an identity. Hashing needs
      // the native shell (the browser mock has no real files), so outside
      // Tauri this step degrades to suggestions only.
      let hash: string | null = null;
      let fingerprint: SkillFingerprint | null = null;
      let contentVerified = false;
      if (isTauri()) {
        if (cached?.hash && cached?.fingerprint) {
          const stat = await skillFingerprint(skill.name);
          if (stat && sameFingerprint(stat, cached.fingerprint)) {
            hash = cached.hash;
            fingerprint = cached.fingerprint;
            contentVerified = true;
          }
        }
        if (hash == null) {
          const analyzed = await analyzeSkill(skill.name);
          hash = analyzed?.hash ?? null;
          fingerprint = analyzed?.fingerprint ?? null;
        }
      }

      // Step 3 — ranked candidates. A near-identical description (≥ threshold)
      // is treated as the same skill and linked without asking; only below the
      // threshold is the decision left to the user. Re-ranking is skipped when
      // the ranking input is unchanged (same namesakes over verified-unchanged
      // content) — the stored ranking is revived instead.
      const key = namesakesKey(namesakes);
      const ranked =
        contentVerified && cached?.namesakesKey === key && cached.candidates?.length
          ? reviveCandidates(skill.name, cached.candidates)
          : rankNamesakes(namesakes, skill.description ?? "");
      const top = ranked[0];
      if (top && top.similarity >= SIMILARITY_AUTO_LINK_THRESHOLD) {
        // No content hash is verified by a description match, so the version
        // marker stays unset — same as a user-confirmed link.
        matched.push({ repo: top.skill.repo, name: skill.name, reason: "description" });
        linked.push(skill.name);
        resolved.set(skill.name, []);
        drops.add(skill.name);
        return;
      }
      resolved.set(skill.name, ranked);
      upserts.set(skill.name, {
        name: skill.name,
        epoch,
        ...(hash != null ? { hash } : {}),
        ...(fingerprint ? { fingerprint } : {}),
        namesakesKey: key,
        candidates: ranked.map(toPersisted),
      });
    }),
  );

  if (matched.length > 0) await recordSkillProvenanceBatch(matched);
  await saveResolutionRecords([...upserts.values()], [...drops]);

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
 * snapshot changes — a fresh snapshot can carry new namesakes. Across
 * restarts the persisted ledger takes over this role.
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
  lastEpoch = -1;
}
