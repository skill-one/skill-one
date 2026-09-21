import type { Skill } from "../types/skill";
import { buildSearchIndex } from "./search-index";
import { popularity } from "./popularity";
import type { SearchHit } from "./registry/protocol";

/**
 * Registry search over the skill list. What counts as a match is not decided
 * here: it comes from `search-index.ts`, the single search entry point shared
 * by the explore registry and the installed-skill page — the skill's name,
 * whole terms and their prefixes, every query term required, a mistyped word
 * matching nothing. This file adds what only the registry needs, and runs
 * inside the worker, once the whole registry has landed: a query is answered by
 * this index or not at all — the caller returns nothing while it is still being
 * built.
 *
 * The ranking layered on top of the shared relevance order:
 * - an exact or prefix name hit ranks above everything else, whatever its BM25
 *   score, and those name hits are ordered by popularity among themselves: a
 *   registry search is usually someone typing a name they already have in
 *   mind, so once the name matches the open question is which of the namesakes
 *   they meant.
 */

/** Search query → hits in relevance order. */
export type SkillSearch = (query: string) => SearchHit[];

// Name tiers, applied as an ordering key rather than a score multiplier: an
// exact or prefix name hit is a far stronger signal than any BM25 combination
// can express, so folding it into the score would only trade one fragile
// constant for another. 0 sorts first, and within a tier popularity decides.
const TIER = { exact: 0, prefix: 1, rest: 2 } as const;

/**
 * Name normalization for the tiers: separators and case are dropped, so a
 * typed "pdf exporter" matches the name "pdf-exporter".
 */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}]+/gu, "");
}

function nameTier(normalizedName: string, normalizedQuery: string): number {
  if (!normalizedQuery) return TIER.rest;
  if (normalizedName === normalizedQuery) return TIER.exact;
  if (normalizedName.startsWith(normalizedQuery)) return TIER.prefix;
  return TIER.rest;
}

/**
 * Build the registry search over the whole skill list. This costs hundreds of
 * milliseconds for ~24k entries, so it must only run inside the worker —
 * the main thread never calls it.
 */
export function buildSkillSearch(skills: Skill[]): SkillSearch {
  const search = buildSearchIndex(skills);

  // Precomputed once rather than per query: both run on every hit, and
  // popularity is the sort key inside each name tier.
  const normalizedNames = skills.map((skill) => normalizeName(skill.name));
  const popularities = skills.map(popularity);

  // An empty query yields no results (and no fallback either); the caller
  // treats it as "no search" and shows the full registry instead.
  return (query) => {
    // The shared index returns hits in BM25 order with the matched name terms,
    // every query term already satisfied.
    const normalizedQuery = normalizeName(query);
    return search(query)
      .map(({ id, score, matched }) => ({
        skill: skills[id],
        matched,
        score,
        popularity: popularities[id],
        tier: nameTier(normalizedNames[id], normalizedQuery),
      }))
      // Name tier first (exact, then prefix, then the rest); within a tier
      // popularity decides, with BM25 as the final tie-break. Inside the name
      // tiers every hit is named by the query already, so the open question is
      // which of the namesakes was meant. The rest are names that carry the
      // terms without starting with them, where a popular skill is the better
      // answer than a more textually dense one — so popularity leads there too.
      .toSorted(
        (a, b) =>
          a.tier - b.tier || b.popularity - a.popularity || b.score - a.score,
      )
      .map(({ skill, matched }) => ({ skill, matched }));
  };
}
