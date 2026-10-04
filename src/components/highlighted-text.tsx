/**
 * Matched terms in a skill's name, from the search that produced this hit.
 * Both indexes that feed a skill card — the registry's, built in the worker,
 * and the installed list's, built in memory — hand over this shape.
 */
export type SkillMatched = { name?: readonly string[] };

/** Terms come from user-visible text, so they are escaped before use in a RegExp. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The splitter each set of terms implies, compiled once per *term set* rather
 * than once per row. Every row in one answer is highlighted from the same terms
 * — the index reports the same matched words for all of them — so a page of
 * several hundred rows was compiling the very same pattern hundreds of times
 * over, on every render. Keyed by the pattern it compiles, so a term set that
 * comes back (a revisited search, a re-render) costs a lookup.
 */
const splitters = new Map<string, RegExp>();

/**
 * How many term sets to keep. A reader's session asks a bounded number of
 * searches, so this is generous rather than tight; it exists so that a long
 * session cannot grow the table without end, and it resets wholesale rather
 * than tracking ages — the terms a running app needs are the recent ones, and
 * the next lookup rebuilds in microseconds.
 */
const MAX_CACHED_SPLITTERS = 64;

function splitterFor(terms: readonly string[]): RegExp {
  // Longest first: an overlapping longer term wins over a shorter one.
  const pattern = [...new Set(terms)]
    .toSorted((a, b) => b.length - a.length)
    .map(escapeForRegExp)
    .join("|");
  const cached = splitters.get(pattern);
  if (cached) return cached;
  if (splitters.size >= MAX_CACHED_SPLITTERS) splitters.clear();
  const splitter = new RegExp(`(${pattern})`, "iu");
  splitters.set(pattern, splitter);
  return splitter;
}

/**
 * Text with search-match highlighting: matched terms are wrapped in `<mark>`.
 * Without terms the text renders as a single node, keeping the non-search DOM
 * identical to an unhighlighted one.
 *
 * The terms are whole indexed tokens, so splitting the text on the terms
 * themselves marks exactly what the index matched. A term is also marked where
 * a longer word merely contains it — the text is split on the term itself, so
 * "pdf" is marked inside "pdfs" even though the index holds whole tokens.
 */
export function HighlightedText({
  text,
  terms,
}: {
  text: string;
  /** Matched terms for this field; absent outside a search. */
  terms?: readonly string[];
}) {
  if (!terms?.length) return text;
  return (
    <>
      {text.split(splitterFor(terms)).map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-[2px] bg-primary/15 text-inherit dark:bg-primary/25"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
