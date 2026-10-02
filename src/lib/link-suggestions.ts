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
 * - **Session memo** (`resolved`): cleared when the served dataset changes.
 * - **Ledger** (`PendingRecord` in `.skill-one.jsonl`, persisted): the ranking
 *   is stamped with the served snapshot's identity, guarded by a stat-only
 *   directory `fingerprint`, and keyed by a digest of its ranking input. A
 *   restart re-runs nothing while the snapshot and the directory are unchanged.
 *
 * Only outcomes worth a line are persisted. A dead end — no same-slug entry —
 * is one in-memory query that cannot go stale between runs, so it is recomputed
 * instead of cached; a name with no candidates left in the ledger is the format
 * working as intended, not a loss. What does get written is the ranking waiting
 * on the user and the repos they cut, which is a decision rather than a cache.
 *
 * Namesake lookup goes through the registry worker's search (`searchSkills`,
 * filtered to exact slug equality client-side). When the registry is not ready
 * (still streaming, or a test environment with no worker) every lookup degrades
 * to "no candidates" — the UI then shows the plain local-install presentation.
 */

import type { Skill } from "../types/skill";
import { getRegistrySnapshot, searchSkills } from "./registry/client";
import { skillFingerprint } from "./skills-manager";
import { isTauri } from "./tauri";
import { descriptionSimilarity } from "./description-similarity";
import {
  dismissSkillSource,
  loadPendingRecords,
  recordSkillProvenanceBatch,
  savePendingRecords,
} from "./provenance";
import type {
  PendingRecord,
  PersistedCandidate,
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
 * The user cut a skill's source association (detail drawer): the source
 * record is replaced by a pending record listing the repo in `repos` — the
 * auto-link tier never links it back on its own — and the session memo is
 * cleared so the next reconcile pass re-runs the lookup and surfaces what
 * remains.
 */
export async function unlinkSkillSource(
  name: string,
  repo: string,
): Promise<void> {
  await dismissSkillSource(name, repo);
  resolved.delete(name);
}

/**
 * On-demand candidates for the detail drawer's change-source popover: the
 * namesakes of `name` ranked by description similarity, minus the currently
 * linked repo. A pure lookup — nothing is written; the caller records the
 * user's pick (or dismissal) itself.
 */
export async function findLinkCandidates(
  name: string,
  description?: string,
  opts?: { excludeRepo?: string },
): Promise<LinkCandidate[]> {
  const namesakes = await findNamesakes(name);
  return rankNamesakes(namesakes, description ?? "").filter(
    (c) => !opts?.excludeRepo || c.skill.repo !== opts.excludeRepo,
  );
}

/**
 * A short stable digest of the ranking input: the full namesake list's
 * identity fields (the repo and the descriptions the similarity reads). A
 * fresh lookup carrying the same digest ranks identically over unchanged
 * content, so the stored ranking is revived instead of recomputed.
 *
 * A digest rather than the canonical string itself, which was longer than the
 * five candidates it guards. Two independent 32-bit string hashes give 64 bits
 * — ample for the handful of records one ledger holds, and this is a cache key
 * rather than a security primitive, where a collision would cost a re-ranking.
 */
function rankingKey(namesakes: Skill[]): string {
  const canonical = namesakes
    .map((s) => [s.repo, s.description, s.descriptionZh ?? ""].join("\u0000"))
    .toSorted()
    .join("\u0001");
  return fnv1a(canonical) + djb2(canonical);
}

/** FNV-1a, 32-bit. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** djb2, 32-bit — a different mixing function, so the two halves disagree. */
function djb2(input: string): string {
  let h = 0x1505;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 33) + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
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
 * re-query the worker nor re-rank anything until the served snapshot or the
 * skill's own content changes.
 */
export async function resolveAssociations(
  unlinked: Array<{ name: string; description?: string }>,
): Promise<{ linked: string[]; suggestions: LinkSuggestions }> {
  // The identity both sides must agree on before a stored ranking may be
  // reused. Absent on either side — a file with no header, a snapshot the
  // source could not name — and nothing stored is trusted.
  const served = getRegistrySnapshot().index?.etag;
  const stored = await loadPendingRecords();
  const verifiedIndex = served !== undefined && stored.index === served ? served : null;
  const linked: string[] = [];
  const matched: Array<{
    repo: string;
    name: string;
    reason: SourceLinkReason;
  }> = [];
  const upserts = new Map<string, PendingRecord>();
  const drops = new Set<string>();

  await Promise.all(
    unlinked.map(async (skill) => {
      if (resolved.has(skill.name)) return; // dead end or cached candidates

      const cached = stored.records[skill.name];
      // A repo the user cut (via the detail drawer) must never ride the
      // cache: the lookup re-runs so the suppression applies to the fresh
      // ranking, and the cut is carried into whatever outcome is stored.
      const cut = new Set(cached?.repos ?? []);
      if (cached && verifiedIndex !== null && cut.size === 0 && cached.candidates?.length) {
        // Verified against the snapshot now being served. The ranking itself
        // is content-dependent (it reads the local description), so its reuse
        // revalidates the directory. The browser mock has no real files, so
        // there the stored ranking stands in as-is.
        if (!isTauri()) {
          resolved.set(skill.name, reviveCandidates(skill.name, cached.candidates));
          return;
        }
        if (cached.fingerprint) {
          const stat = await skillFingerprint(skill.name);
          if (stat && sameFingerprint(stat, cached.fingerprint)) {
            resolved.set(skill.name, reviveCandidates(skill.name, cached.candidates));
            return;
          }
        }
        // Stale content or no fingerprint to check — fall through and redo.
      }

      // Step 1 — the cheap filter: without same-slug entries there is no
      // association to make and no reason to look at the skill's directory.
      const namesakes = await findNamesakes(skill.name);
      if (namesakes.length === 0) {
        // A dead end is one in-memory query that cannot go stale between
        // runs, so it earns no line: it is recomputed next time. The user's
        // own cuts do earn one — a future snapshot that re-introduces a cut
        // repo must not auto-link it behind their back — and a cache this
        // run did not reproduce is dropped rather than left to rot.
        resolved.set(skill.name, []);
        if (cut.size > 0) {
          upserts.set(skill.name, { kind: "pending", name: skill.name, repos: [...cut] });
        } else if (cached) {
          drops.add(skill.name);
        }
        return;
      }

      // Step 2 — the directory's current state, stat-only. A stored ranking is
      // only reusable while this fingerprint still matches disk, and a
      // fingerprint is exactly what a fresh record needs to be reusable later,
      // so one stat call answers both. No file bytes are read: the registry
      // publishes no per-skill hash for a content hash to match, so walking
      // the directory would buy nothing. Outside Tauri there are no real
      // files to stat, and the record simply carries no fingerprint.
      const fingerprint = isTauri() ? await skillFingerprint(skill.name) : null;
      const unchanged =
        fingerprint !== null &&
        cached?.fingerprint !== undefined &&
        sameFingerprint(fingerprint, cached.fingerprint);

      // Step 3 — ranked candidates. A near-identical description (≥ threshold)
      // is treated as the same skill and linked without asking; only below the
      // threshold is the decision left to the user. Re-ranking is skipped when
      // the ranking input is unchanged (same namesakes over unchanged content)
      // — the stored ranking is revived instead.
      const key = rankingKey(namesakes);
      const ranked =
        unchanged && cached?.key === key && cached.candidates?.length
          ? reviveCandidates(skill.name, cached.candidates)
          : rankNamesakes(namesakes, skill.description ?? "");
      // The auto-link candidate is the best-ranked namesake the user has not
      // cut; a cut top stays in `ranked` as a manual candidate.
      const top = ranked.find((c) => !cut.has(c.skill.repo));
      if (top && top.similarity >= SIMILARITY_AUTO_LINK_THRESHOLD) {
        matched.push({ repo: top.skill.repo, name: skill.name, reason: "description" });
        linked.push(skill.name);
        resolved.set(skill.name, []);
        drops.add(skill.name);
        return;
      }
      resolved.set(skill.name, ranked);
      upserts.set(skill.name, {
        kind: "pending",
        name: skill.name,
        key,
        ...(fingerprint ? { fingerprint } : {}),
        candidates: ranked.map(toPersisted),
        ...(cut.size > 0 ? { repos: [...cut] } : {}),
      });
    }),
  );

  if (matched.length > 0) await recordSkillProvenanceBatch(matched);
  await savePendingRecords([...upserts.values()], [...drops], served);

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
 * Per-skill resolution memoization for the current run: `[]` marks a dead end
 * (no namesakes) or a linked skill; a non-empty array holds the candidates
 * found for it. Cleared when the served dataset changes — a fresh dataset can
 * carry new namesakes. It is deliberately session-scoped: surviving a restart
 * is the persisted ledger's job, keyed to the snapshot's identity rather than
 * to this counter.
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
