import MiniSearch from "minisearch";

/**
 * The store's single search entry point. Both searchable lists build their
 * index here — the explore skill registry and the installed skills page — so
 * "what counts as a match" has one definition, where it used to be one fuzzy
 * engine plus two ad-hoc substring filters.
 *
 * The one indexed field is the skill's name. A name is an ASCII slug
 * (`pdf-exporter`), so MiniSearch's own tokenizer is all that is needed, and a
 * store of named things is asked for by name anyway: the repository and the
 * description a row carries are deliberately not searched.
 *
 * The semantics are deliberately strict. A query term must equal an indexed
 * term or the start of one (`prefix`), and nothing else is forgiven: a mistyped
 * letter matches nothing. Typo tolerance used to be on and was removed on
 * purpose — edit-distance matching surfaced unrelated skills for short queries
 * without a way to tune it.
 *
 * One rule still softens the strictness: search-as-you-type `prefix` answers a
 * half-typed word, since that is an unfinished query rather than a wrong one.
 * Every term must match, though — there is no OR fallback, so one unmatched
 * word blanks the list rather than widening it to unrelated hits.
 *
 * Tokenization is MiniSearch's own: split on whitespace and punctuation, then
 * lowercase, so `pdf-exporter` answers to `exporter`, `pdf` and `pdf-exp`.
 */

/** One indexed document plus its match, in relevance order. */
export interface IndexHit<T> {
  /** Position in the array the index was built from. */
  id: number;
  doc: T;
  /** BM25 relevance over the name field. */
  score: number;
  /** The name's matched query terms, for highlighting. */
  matched: { name?: readonly string[] };
}

/** A built index: query in, ranked hits out. */
export type Search<T> = (query: string) => IndexHit<T>[];

/**
 * Build a search over `docs` by name. Documents are addressed by their array
 * position (a registry skill has no unique id of its own — one repo hosts
 * several), and hits carry both the id and the document, so callers can either
 * use the document directly or look up their own parallel arrays by id.
 *
 * Building is O(indexed terms): a few hundred milliseconds over the whole
 * registry, which is why the registry index is built in the worker and the
 * small per-page indexes over installed skills are built in a `useMemo`.
 */
export function buildSearchIndex<T extends { name: string }>(
  docs: readonly T[],
): Search<T> {
  const miniSearch = new MiniSearch<T & { id: number }>({
    fields: ["name"],
    searchOptions: {
      // Half-typed words answer; wrong words do not.
      prefix: true,
    },
  });
  miniSearch.addAll(docs.map((doc, id) => ({ ...doc, id })) as (T & {
    id: number;
  })[]);

  return (query) => {
    // Every term must match: an unmatched word narrows the list to nothing
    // rather than widening it to unrelated hits.
    const hits = miniSearch.search(query, { combineWith: "AND" });
    return hits.map(({ id, match, score }) => ({
      id: id as number,
      doc: docs[id as number],
      score,
      // The name is the only indexed field, so every matched term is a name
      // term; MiniSearch keys `match` by term.
      matched: { name: Object.keys(match) },
    }));
  };
}
