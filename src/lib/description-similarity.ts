/**
 * Description similarity for store↔install association: how strongly a
 * locally installed skill's description matches a registry entry's.
 *
 * A description alone never proves two skills are the same (forks share
 * wording; trigger-phrase boilerplate collides) — this score only ranks
 * same-name candidates for the user to confirm, and is deliberately a plain,
 * explainable token overlap rather than a fuzzy "AI-ish" metric.
 *
 * Tokenization: lowercase, split on non-alphanumeric runs. Latin text yields
 * words; Han text has no word separators, so each Han run is exploded into
 * character bigrams (the same trick `search-index.ts` uses) — a shared
 * Chinese phrase then overlaps even without word boundaries.
 */

/** Normalize a description into comparison tokens. */
export function tokenizeDescription(text: string): string[] {
  const tokens: string[] = [];
  for (const run of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    // A run mixes scripts freely ("读取pdf文件"): split it into Han and
    // non-Han segments, then explode each Han segment into character
    // bigrams — Han carries no word boundaries, so bigrams give it
    // comparable granularity to Latin words.
    for (const seg of run.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu) ?? []) {
      if (!/\p{Script=Han}/u.test(seg)) {
        tokens.push(seg);
        continue;
      }
      if (seg.length === 1) {
        tokens.push(seg);
        continue;
      }
      for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
    }
  }
  return tokens;
}

/**
 * Jaccard similarity of two descriptions: |shared tokens| / |all tokens|,
 * 0 for pairs where either side has none. Order-independent, length-tolerant.
 */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenizeDescription(a);
  const tb = tokenizeDescription(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  return shared / (setA.size + setB.size - shared);
}
