import MiniSearch from "minisearch";

import type { Skill } from "../types/skill";

/**
 * Client-side fuzzy search over the skill registry, powered by MiniSearch
 * (inverted index + BM25+ ranking). Relevance is computed per field with
 * field boosts keeping the priority name > repo > description, and a
 * log-scale popularity boost nudges heavily installed skills upward —
 * relevance stays the primary signal.
 */

/** Registry fields that are indexed and searched. */
export type SkillSearchField = "name" | "repo" | "description";

/** One search result: the skill plus what matched, for highlighting. */
export interface SkillSearchHit {
  skill: Skill;
  /**
   * Matched indexed terms per field. The terms are the expanded ones
   * MiniSearch actually matched (a prefix query "redi" reports "redis"), and
   * tokens follow MiniSearch's default tokenizer. Empty outside a search.
   */
  matched: Partial<Record<SkillSearchField, readonly string[]>>;
}

/** Search query → hits in relevance order. */
export type SkillSearch = (query: string) => SkillSearchHit[];

// Indexed documents need a unique id; Skill carries none (a repo can host
// several skills), so documents are decorated with their registry position
// and results are mapped back to the original objects through the closure.
type IndexedSkill = Skill & { id: number };

// MiniSearch multiplies each field's BM25 term score by its boost, so these
// are relative magnitudes, not weights that must sum to 1. The ratios are
// tuned against the popularity boost (max ~2.3×): popularity can outweigh
// one step of field priority (2×) but never two (4×) — a hugely popular
// repo match may outrank a zero-install name match, while a description match
// cannot.
const FIELD_BOOSTS = { name: 4, repo: 2, description: 1 };

// Popularity boost divisor: 5 tops out at a ~2.3× multiplier for the most
// installed skills (log10(1 + ~3M) ≈ 6.5 → ~2.3), so popularity can jump
// over a "one notch" relevance gap but rarely further.
const POPULARITY_DIVISOR = 5;

/**
 * Log-scale popularity multiplier: more installs rank higher, but huge
 * counts stay comparable instead of drowning out match quality. Guarded
 * against missing/negative values so the result is always ≥ 1 (a falsy
 * boost would drop the document from the results entirely).
 */
function popularityBoost(downloads: number): number {
  return 1 + Math.log10(1 + Math.max(0, downloads || 0)) / POPULARITY_DIVISOR;
}

/**
 * MiniSearch reports matches as `{ [term]: field[] }`; invert to
 * `{ [field]: term[] }` so the UI can highlight each displayed field.
 */
function invertMatch(
  match: Record<string, string[]>,
): Partial<Record<SkillSearchField, readonly string[]>> {
  const matched: Partial<Record<SkillSearchField, string[]>> = {};
  for (const [term, fields] of Object.entries(match)) {
    for (const field of fields) {
      // The keys of `match` are exactly the configured search fields.
      (matched[field as SkillSearchField] ??= []).push(term);
    }
  }
  return matched;
}

// Building the inverted index is expensive (hundreds of ms for the full
// ~24k-skill registry), and `useMemo` does not survive route changes — the
// explore page remounts on every visit. Cache the built search per data
// reference: the same array reuses its index across mounts, and only a new
// array (a fresh fetch) triggers a rebuild.
const searchCache = new WeakMap<Skill[], SkillSearch>();

export function createSkillSearch(skills: Skill[]): SkillSearch {
  let search = searchCache.get(skills);
  if (!search) {
    search = buildSkillSearch(skills);
    searchCache.set(skills, search);
  }
  return search;
}

/**
 * Plain case-insensitive substring search over the same fields, used while
 * the registry is still streaming in: building the MiniSearch index for
 * every progress snapshot would cost more than the whole streaming window.
 * No ranking and no highlighting (matched stays empty) — results settle into
 * the full fuzzy search once the index finishes loading.
 */
export function containsSearch(
  skills: Skill[],
  query: string,
): SkillSearchHit[] {
  const q = query.toLowerCase();
  return skills
    .filter((skill) =>
      [skill.name, skill.repo, skill.description].some((field) =>
        field.toLowerCase().includes(q),
      ),
    )
    .map((skill) => ({ skill, matched: {} }));
}

function buildSkillSearch(skills: Skill[]): SkillSearch {
  const miniSearch = new MiniSearch<IndexedSkill>({
    fields: ["name", "repo", "description"],
    searchOptions: {
      boost: FIELD_BOOSTS,
      // Search-as-you-type and typo tolerance (edit distance ≤ 20% of the
      // term length).
      prefix: true,
      fuzzy: 0.2,
      // Popularity: multiply each document's score by its install-count boost.
      boostDocument: (id) => popularityBoost(skills[id].downloads),
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
