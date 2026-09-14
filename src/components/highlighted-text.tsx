/**
 * Matched indexed terms per field, from the search that produced this hit.
 * Both indexes that feed a skill card — the registry's, built in the worker,
 * and the installed list's, built in memory — hand over this shape.
 */
export type SkillMatched = Partial<Record<string, readonly string[]>>;

/** Terms come from user-visible text, so they are escaped before use in a RegExp. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Text with search-match highlighting: matched terms are wrapped in `<mark>`.
 * Without terms the text renders as a single node, keeping the non-search DOM
 * identical to an unhighlighted one.
 *
 * The terms are whole indexed tokens, so splitting the text on the terms
 * themselves marks exactly what the index matched — for Latin text the same
 * whole words the old token split produced, and for Han text the characters and
 * bigrams that sit *inside* an unsegmented run and no whole-token comparison
 * could ever reach. The one difference is that a term is also marked where a
 * longer word contains it.
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
  // Longest first: an overlapping longer term wins over a shorter one.
  const pattern = [...new Set(terms)]
    .toSorted((a, b) => b.length - a.length)
    .map(escapeForRegExp)
    .join("|");
  const splitter = new RegExp(`(${pattern})`, "iu");
  return (
    <>
      {text.split(splitter).map((part, i) =>
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
