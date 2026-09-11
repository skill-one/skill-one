import MiniSearch from "minisearch";

import type { Skill } from "../types/skill";
import { popularity } from "./popularity";
import type { SearchField, SearchHit } from "./registry/protocol";

/**
 * Client-side fuzzy search over the skill registry, powered by MiniSearch
 * (inverted index + BM25+ ranking). Runs inside the registry worker, and only
 * once the whole registry has landed: a query is answered by this index or not
 * at all — the caller returns nothing while it is still being built.
 * Relevance is computed per field with field boosts keeping the priority
 * name > repo > description, and a log-scale popularity boost nudges
 * high-popularity skills upward — relevance stays the primary signal.
 *
 * Two query-level rules sit on top of the BM25 order:
 * - "all words" first: a hit must match every term, falling back to "any word"
 *   only when no document satisfies the whole query, so one missing term
 *   cannot blank the list;
 * - an exact or prefix name hit ranks above everything else, whatever its BM25
 *   score, and those name hits are ordered by popularity among themselves: a
 *   registry search is usually someone typing a name they already have in
 *   mind, so once the name matches the open question is which of the namesakes
 *   they meant.
 */

/** Search query → hits in relevance order. */
export type SkillSearch = (query: string) => SearchHit[];

// Indexed documents need a unique id; Skill carries none (a repo can host
// several skills), so documents are decorated with their registry position
// and results are mapped back to the original objects through the closure.
type IndexedSkill = Skill & { id: number };

// MiniSearch multiplies each field's BM25 term score by its boost, so these
// are relative magnitudes, not weights that must sum to 1. The ratios are
// tuned against the popularity boost (max ~2.2×): popularity can outweigh the
// name↔repo step (2×) but never repo↔description (4×) or name↔description
// (8×) — a hugely popular repo match may outrank a zero-install name match,
// while a description match cannot.
//
// The description is deliberately half-weighted: a SKILL.md description is
// mostly trigger phrases ("use when the user wants to be grilled on…"), so a
// term there is much weaker evidence of what a skill is called than the same
// term in its name. Lowering it only matters where fields compete — when every
// candidate matches through the description alone, the boost is a common
// factor and the order is unchanged.
const FIELD_BOOSTS = { name: 4, repo: 2, description: 0.5 };

// Popularity boost divisor: 5 tops out at a ~2.2× multiplier for the most
// popular skills (log10 of the top blended figure ≈ 5.9), so popularity can
// jump over a "one notch" relevance gap but rarely further.
const POPULARITY_DIVISOR = 5;

/**
 * Log-scale popularity multiplier: a higher blended installs-and-stars figure
 * ranks higher, but huge counts stay comparable instead of drowning out match
 * quality. Guarded against missing/negative values so the result is always
 * ≥ 1 (a falsy boost would drop the document from the results entirely).
 */
function popularityBoost(skill: Skill): number {
  return 1 + Math.log10(1 + popularity(skill)) / POPULARITY_DIVISOR;
}

// Name tiers, applied as an ordering key rather than a score multiplier: a
// name hit is a far stronger signal than any field/BM25/popularity combination
// can express, so folding it into the score would only trade one fragile
// constant for another. 0 sorts first, and within a tier the BM25 order stands.
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
 * MiniSearch reports matches as `{ [term]: field[] }`; invert to
 * `{ [field]: term[] }` so the UI can highlight each displayed field.
 */
function invertMatch(
  match: Record<string, string[]>,
): Partial<Record<SearchField, readonly string[]>> {
  const matched: Partial<Record<SearchField, string[]>> = {};
  for (const [term, fields] of Object.entries(match)) {
    for (const field of fields) {
      // The keys of `match` are exactly the configured search fields.
      (matched[field as SearchField] ??= []).push(term);
    }
  }
  return matched;
}

/**
 * Build the fuzzy search over the whole registry. This costs hundreds of
 * milliseconds for ~24k entries, so it must only run inside the worker —
 * the main thread never calls it.
 */
export function buildSkillSearch(skills: Skill[]): SkillSearch {
  const miniSearch = new MiniSearch<IndexedSkill>({
    fields: ["name", "repo", "description"],
    searchOptions: {
      boost: FIELD_BOOSTS,
      // Search-as-you-type and typo tolerance (edit distance ≤ 20% of the
      // term length).
      prefix: true,
      fuzzy: 0.2,
      // Popularity: multiply each document's score by its blended-figures boost.
      boostDocument: (id) => popularityBoost(skills[id]),
    },
  });
  miniSearch.addAll(skills.map((skill, id) => ({ ...skill, id })));

  // Precomputed once rather than per query: both run on every hit, and
  // popularity doubles as the sort key inside each name tier.
  const normalizedNames = skills.map((skill) => normalizeName(skill.name));
  const popularities = skills.map(popularity);

  // An empty query yields no results (and no fallback either); the caller
  // treats it as "no search" and shows the full registry instead.
  return (query) => {
    // "All words" first; a query no document satisfies in full falls back to
    // "any word", so one missing term never blanks the list outright.
    const all = miniSearch.search(query, { combineWith: "AND" });
    const hits =
      all.length > 0 ? all : miniSearch.search(query, { combineWith: "OR" });

    const normalizedQuery = normalizeName(query);
    return hits
      .map(({ id, match, score }) => ({
        skill: skills[id],
        matched: invertMatch(match),
        score,
        popularity: popularities[id],
        tier: nameTier(normalizedNames[id], normalizedQuery),
      }))
      // Within a name tier every hit is named by the query already, so the open
      // question is which of the namesakes was meant — and that is what
      // popularity answers, not whether one description happens to repeat a
      // trigger phrase. Hits outside the name tiers keep the BM25 order.
      .toSorted(
        (a, b) =>
          a.tier - b.tier ||
          (a.tier === TIER.rest
            ? b.score - a.score
            : b.popularity - a.popularity || b.score - a.score),
      )
      .map(({ skill, matched }) => ({ skill, matched }));
  };
}
