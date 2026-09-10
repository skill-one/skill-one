import MiniSearch from "minisearch";

import type { Skill } from "../types/skill";
import { popularity } from "./popularity";
import type { SearchField, SearchHit } from "./registry/protocol";

/**
 * Client-side fuzzy search over the skill registry, powered by MiniSearch
 * (inverted index + BM25+ ranking). Runs inside the registry worker.
 * Relevance is computed per field with field boosts keeping the priority
 * name > repo > description, and a log-scale popularity boost nudges
 * high-popularity skills upward — relevance stays the primary signal.
 */

/** Search query → hits in relevance order. */
export type SkillSearch = (query: string) => SearchHit[];

// Indexed documents need a unique id; Skill carries none (a repo can host
// several skills), so documents are decorated with their registry position
// and results are mapped back to the original objects through the closure.
type IndexedSkill = Skill & { id: number };

// MiniSearch multiplies each field's BM25 term score by its boost, so these
// are relative magnitudes, not weights that must sum to 1. The ratios are
// tuned against the popularity boost (max ~2.2×): popularity can outweigh
// one step of field priority (2×) but never two (4×) — a hugely popular
// repo match may outrank a zero-install name match, while a description match
// cannot.
const FIELD_BOOSTS = { name: 4, repo: 2, description: 1, domain: 1 };

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
    fields: ["name", "repo", "description", "domain"],
    // The domain lives nested under the optional profile; skills without
    // one simply do not index any domain terms.
    extractField: (doc, field) =>
      field === "domain"
        ? doc.profile?.domain
        : (doc as unknown as Record<string, unknown>)[field],
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

  // An empty query yields no results here; the caller treats it as "no
  // search" and shows the full registry instead.
  return (query) =>
    miniSearch.search(query).map(({ id, match }) => ({
      skill: skills[id],
      matched: invertMatch(match),
    }));
}

/**
 * Plain case-insensitive substring search over the same fields, used whenever
 * the fuzzy index is not ready: while the registry is still streaming in
 * (building MiniSearch for every progress snapshot would cost more than the
 * whole streaming window). No ranking and no highlighting (matched stays
 * empty) — results settle into the full fuzzy search once the index lands.
 */
export function containsSearch(
  skills: Skill[],
  query: string,
): SearchHit[] {
  const q = query.toLowerCase();
  return skills
    .filter((skill) =>
      [skill.name, skill.repo, skill.description, skill.profile?.domain]
        .filter((field): field is string => typeof field === "string")
        .some((field) => field.toLowerCase().includes(q)),
    )
    .map((skill) => ({ skill, matched: {} }));
}
