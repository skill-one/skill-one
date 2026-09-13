import MiniSearch from "minisearch";

/**
 * The store's single search entry point. Every searchable list builds its
 * index here — the explore skill registry, the repos grid, and the installed
 * skills page — so "what counts as a match" has one definition, where it used
 * to be one fuzzy engine plus two ad-hoc substring filters.
 *
 * The semantics are deliberately strict. A query term must equal an indexed
 * term or the start of one (`prefix`), and nothing else is forgiven: a
 * mistyped letter matches nothing. Typo tolerance used to be on and was
 * removed on purpose — in a store of named things, a query is usually a name
 * the searcher already has in mind, and edit-distance matching surfaced
 * unrelated skills for short queries without a per-field way to tune it.
 *
 * Two rules still soften the strictness, both shared by every surface:
 * - search-as-you-type: `prefix` answers a half-typed word, since that is an
 *   unfinished query rather than a wrong one;
 * - all terms first, any term second: a query is run with AND, and only when
 *   no document matches every term does it fall back to OR, so one unmatched
 *   word can never blank the whole list.
 *
 * Tokenization is the other half of the contract, and it is not MiniSearch's
 * default. Splitting on whitespace and punctuation is fine for Latin text but
 * leaves a Chinese phrase as a single term, which then only matches as its own
 * prefix — searching a Chinese skill description for 提交 would find nothing.
 * So each Han run is additionally indexed as its overlapping bigrams plus its
 * single characters: a multi-character query keeps adjacency significant (the
 * bigrams of 提交 match only text where those two characters sit together, not
 * a stray 提 and 交 in different words), and a one-character query still works.
 * A matched Han term is a substring inside a longer run, which the list rows
 * mark because they highlight terms wherever they occur.
 */

/** One indexed document plus its match, in relevance order. */
export interface IndexHit<T> {
  /** Position in the array the index was built from. */
  id: number;
  doc: T;
  /** BM25 relevance, after field boosts and any document boost. */
  score: number;
  /** Matched query terms per indexed field, for highlighting. */
  matched: Partial<Record<string, readonly string[]>>;
}

/** A built index: query in, ranked hits out. */
export type Search<T> = (query: string) => IndexHit<T>[];

export interface SearchIndexOptions<T> {
  /**
   * Indexed fields and their relative boosts. MiniSearch multiplies each
   * field's term score by its boost, so these are magnitudes that compete
   * with each other, not weights that must sum to 1.
   */
  fields: Partial<Record<keyof T & string, number>>;
  /**
   * Per-document multiplier, applied on top of the relevance score. Used to
   * nudge popular skills upward without letting a huge count outrank a better
   * field match.
   */
  boostDocument?: (doc: T) => number;
}

// MiniSearch's own default split: whitespace and punctuation. Kept as the
// first pass so `pdf-exporter` still breaks into `pdf` and `exporter`.
const SEPARATORS = /[\n\r\p{Z}\p{P}]+/u;
const HAN = /\p{Script=Han}/u;

/**
 * Split text into indexed terms: Latin runs as whole words, Han runs as their
 * single characters and overlapping bigrams. Case is not touched here —
 * MiniSearch's `processTerm` lowercases every term afterwards, on both sides
 * of the index.
 */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  for (const chunk of text.split(SEPARATORS)) {
    const chars = Array.from(chunk);
    if (chars.length === 0) continue;
    // Cut the chunk into runs of Han and non-Han characters, then expand each.
    let start = 0;
    let runIsHan = HAN.test(chars[0]);
    for (let i = 1; i <= chars.length; i++) {
      const boundary = i === chars.length || HAN.test(chars[i]) !== runIsHan;
      if (!boundary) continue;
      const run = chars.slice(start, i);
      if (runIsHan) {
        terms.push(...run);
        for (let j = 0; j + 1 < run.length; j++) {
          terms.push(run.slice(j, j + 2).join(""));
        }
      } else {
        terms.push(run.join(""));
      }
      start = i;
      runIsHan = i < chars.length ? HAN.test(chars[i]) : false;
    }
  }
  return terms;
}

/**
 * MiniSearch reports a match as `{ [term]: field[] }`; invert it to
 * `{ [field]: term[] }` so a caller can highlight each displayed field.
 */
function invertMatch(
  match: Record<string, readonly string[]>,
): Partial<Record<string, readonly string[]>> {
  const matched: Partial<Record<string, string[]>> = {};
  for (const [term, fields] of Object.entries(match)) {
    for (const field of fields) {
      (matched[field] ??= []).push(term);
    }
  }
  return matched;
}

/**
 * Build a search over `docs`. Documents are addressed by their array position
 * (a registry skill has no unique id of its own — one repo hosts several), and
 * hits carry both the id and the document, so callers can either use the
 * document directly or look up their own parallel arrays by id.
 *
 * Building is O(indexed terms): a few hundred milliseconds over the whole
 * registry, which is why the registry index is built in the worker and the
 * small per-page indexes over installed skills are built in a `useMemo`.
 */
export function buildSearchIndex<T extends object>(
  docs: readonly T[],
  options: SearchIndexOptions<T>,
): Search<T> {
  const boost = options.fields as Record<string, number>;
  const boostDocument = options.boostDocument;
  const miniSearch = new MiniSearch<T & { id: number }>({
    fields: Object.keys(boost),
    tokenize,
    searchOptions: {
      boost,
      // Half-typed words answer; wrong words do not.
      prefix: true,
      ...(boostDocument && {
        boostDocument: (id: number) => boostDocument(docs[id]),
      }),
    },
  });
  miniSearch.addAll(docs.map((doc, id) => ({ ...doc, id })) as (T & {
    id: number;
  })[]);

  return (query) => {
    // All terms first; a query no document satisfies in full falls back to any
    // term, so one missing word never blanks the list outright.
    const all = miniSearch.search(query, { combineWith: "AND" });
    const hits =
      all.length > 0 ? all : miniSearch.search(query, { combineWith: "OR" });
    return hits.map(({ id, match, score }) => ({
      id: id as number,
      doc: docs[id as number],
      score,
      matched: invertMatch(match),
    }));
  };
}
