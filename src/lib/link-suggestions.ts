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
 *    ranked by description similarity. A single namesake at/above
 *    `SIMILARITY_AUTO_LINK_THRESHOLD` means the wording is close enough to
 *    call it the same skill, so the association is written automatically (no
 *    prompt). Below the threshold — or with several namesakes clearing it,
 *    which identical fork wording makes routine — the decision is left to the
 *    user: the ranked candidates are surfaced for confirmation and nothing is
 *    written until they pick one.
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
 * Namesake lookup is one batched query for the whole pass, answered from the
 * worker's name index (`namesakes`) rather than by a name search per skill.
 * When the registry is not ready (still streaming, or a test environment with
 * no worker) every lookup degrades to "no candidates" — the UI then shows the
 * plain local-install presentation.
 */

import type { Skill } from "../types/skill";
import { getRegistrySnapshot, namesakeSkills } from "./registry/client";
import { skillFingerprint } from "./skills-manager";
import { isTauri } from "./tauri";
import { descriptionSimilarity } from "./description-similarity";
import { popularity } from "./popularity";
import { isSearchableQuery, searchSkillsSh } from "./skills-sh";
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

/**
 * Registry entries filed under each of `names`, keyed by name. A name with no
 * entry is absent from the map — which is what "no namesake" means to every
 * caller.
 *
 * One batched query for the whole list, because this is an exact-key question
 * ("a skill called exactly this, and which repos publish it") that the worker
 * answers from a name index. It used to be a name search per skill whose hits
 * were filtered down to the exact matches, which cost a full BM25 pass and a
 * page of crossed-boundary objects per skill to throw nearly all of away.
 *
 * The key is the skill's slug *or* the source repository's directory name,
 * whichever the registry filed it under (see `namesakeIndex`) — so a skill
 * published as `stitch::generate-design` is still found by the directory it
 * lands in.
 */
async function findNamesakes(
  names: readonly string[],
): Promise<Map<string, Skill[]>> {
  const byName = new Map<string, Skill[]>();
  // The search index answers only once the registry is ready; before that (and
  // in worker-less test environments) there are simply no candidates.
  if (names.length === 0 || !getRegistrySnapshot().ready) return byName;
  try {
    const { entries } = await namesakeSkills([...names]);
    names.forEach((name, i) => {
      const family = entries[i];
      if (family && family.length > 0) byName.set(name, family);
    });
  } catch {
    // A failed lookup reads as "no candidates", like an empty answer.
  }
  return byName;
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
 *
 * Equal scores are broken by `popularity` — the same figure, and the same
 * tie-break, the store's own namesake ranking uses. It matters because the
 * ranking's first job is to be *stable*: forks copy frontmatter verbatim, so a
 * same-slug family routinely carries two byte-identical descriptions, and
 * without a tie-break `toSorted`'s stability would hand the top slot to
 * whichever namesake the registry happened to list first.
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
    .toSorted((a, b) => {
      // Composite score: text similarity + popularity boost (logarithmic stars/installs)
      // When similarity is equal or very close, high-reputation official repos win.
      // But a genuinely high text match (e.g. 0.85 vs 0.10) is preserved.
      const popA = popularity(a.skill);
      const popB = popularity(b.skill);
      const boostA = popA > 0 ? Math.min(0.25, Math.log10(popA + 1) * 0.045) : 0;
      const boostB = popB > 0 ? Math.min(0.25, Math.log10(popB + 1) * 0.045) : 0;
      const scoreDiff = b.similarity + boostB - (a.similarity + boostA);
      if (Math.abs(scoreDiff) > 1e-4) {
        return scoreDiff;
      }
      return popB - popA;
    })
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
  repo?: string,
): Promise<void> {
  await dismissSkillSource(name, repo ?? "");
  resolved.delete(name);
}

/**
 * When the registry index carries no store namesake for `name`, fallback to
 * searching skills.sh live for exact same-slug entries.
 */
async function findNamesakesWithSkillsShFallback(
  name: string,
  namesakes: Skill[],
): Promise<Skill[]> {
  if (namesakes.length > 0 || !isSearchableQuery(name)) return namesakes;
  try {
    const hits = await searchSkillsSh(name);
    const exact = hits.filter(
      (h) => h.name.toLowerCase() === name.toLowerCase() && h.repo,
    );
    const seenRepos = new Set<string>();
    const result: Skill[] = [];
    for (const h of exact) {
      if (!seenRepos.has(h.repo)) {
        seenRepos.add(h.repo);
        result.push({
          name: h.name,
          id: h.id,
          displayName: h.displayName,
          repo: h.repo,
          description: h.description || "",
          stars: h.stars || 0,
          downloads: h.downloads || 0,
          url: h.url,
        });
      }
    }
    return result;
  } catch {
    return namesakes;
  }
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
  if (!getRegistrySnapshot().ready) return [];
  const byName = await findNamesakes([name]);
  let namesakes = byName.get(name) ?? [];
  if (namesakes.length === 0) {
    namesakes = await findNamesakesWithSkillsShFallback(name, namesakes);
  }
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
    ...(skill.profile?.domain ? { domain: skill.profile.domain } : {}),
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
      ...(candidate.domain ? { profile: { domain: candidate.domain } } : {}),
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
  const upserts = new Map<string, PendingRecord>();
  const drops = new Set<string>();

  // Pass 1 — a skill whose stored ranking still describes it is answered from
  // the ledger, without asking the registry anything.
  const outstanding = (
    await Promise.all(
      unlinked.map(async (skill) => {
        if (resolved.has(skill.name)) return null; // dead end or cached candidates
        const cached = stored.records[skill.name];
        if (
          cached &&
          verifiedIndex !== null &&
          cached.candidates?.length
        ) {
          if (!isTauri()) {
            resolved.set(skill.name, reviveCandidates(skill.name, cached.candidates));
            return null;
          }
          const stat = await skillFingerprint(skill.name);
          if (cached.fingerprint && stat && sameFingerprint(stat, cached.fingerprint)) {
            resolved.set(skill.name, reviveCandidates(skill.name, cached.candidates));
            return null;
          }
        }
        return { skill, cached };
      }),
    )
  ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // Pass 2 — query namesakes for skills the ledger did not answer
  const byName = await findNamesakes(outstanding.map((entry) => entry.skill.name));

  await Promise.all(
    outstanding.map(async ({ skill, cached }) => {
      let namesakes = byName.get(skill.name) ?? [];
      if (namesakes.length === 0 && getRegistrySnapshot().ready) {
        namesakes = await findNamesakesWithSkillsShFallback(skill.name, namesakes);
      }
      if (namesakes.length === 0) {
        resolved.set(skill.name, []);
        if (cached) {
          drops.add(skill.name);
        }
        return;
      }

      const fingerprint = isTauri() ? await skillFingerprint(skill.name) : null;
      const unchanged =
        fingerprint !== null &&
        cached?.fingerprint !== undefined &&
        sameFingerprint(fingerprint, cached.fingerprint);

      const key = rankingKey(namesakes);
      const ranked =
        unchanged && cached?.key === key && cached.candidates?.length
          ? reviveCandidates(skill.name, cached.candidates)
          : rankNamesakes(namesakes, skill.description ?? "");

      resolved.set(skill.name, ranked);
      upserts.set(skill.name, {
        kind: "pending",
        name: skill.name,
        key,
        ...(fingerprint ? { fingerprint } : {}),
        candidates: ranked.map(toPersisted),
      });
    }),
  );

  await savePendingRecords([...upserts.values()], [...drops], served);

  // Assemble suggestions from the memoized candidates
  const suggestions: LinkSuggestions = {};
  for (const skill of unlinked) {
    const candidates = resolved.get(skill.name);
    if (candidates && candidates.length > 0) {
      suggestions[skill.name] = candidates;
    }
  }
  return { linked: [], suggestions };
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
