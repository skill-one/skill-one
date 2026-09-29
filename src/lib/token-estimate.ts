/**
 * Rough token-cost estimate for a skill's description — the share of the
 * model's context a skill's frontmatter `description` spends when the agent
 * loads it. Exact tokenization needs a model-specific BPE vocabulary (2 MB+
 * of tables), which is not worth shipping for a display-only figure, so this
 * is a calibrated heuristic instead.
 *
 * The formula counts what BPE actually tokenizes into roughly one token each:
 * ASCII words, punctuation marks, and CJK characters — with CJK weighted
 * 0.75, because modern vocabularies (o200k_base) merge common CJK word pairs
 * into single tokens.
 *
 * Calibrated against `js-tiktoken` (o200k_base) over 1800+ real skill
 * descriptions from the skills-profiles dataset:
 *
 * - English: MAPE 9.9%, mean bias −6.5 tokens (avg. description ≈ 78 tokens)
 * - Chinese: MAPE 8.1%, mean bias −0.5 tokens
 *
 * For comparison, the common `chars / 4` rule misses by ~27% (MAPE) on the
 * same data. Treat the result as a comparison metric between skills, not an
 * exact per-model count.
 */

/** CJK unified ideographs plus the URO extension A block. */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/g;

/** ASCII word runs — letters, digits, and in-word apostrophes/hyphens. */
const WORD = /[A-Za-z0-9'’\-]+/g;

/**
 * Estimate how many tokens `text` costs. An empty (or whitespace-only) string
 * estimates to 0.
 */
export function estimateTokens(text: string): number {
  const cjk = (text.match(CJK) ?? []).length;
  // Strip CJK first so the characters do not double-count as punctuation.
  const rest = text.replace(CJK, " ");
  const words = (rest.match(WORD) ?? []).length;
  // Everything that is neither a word nor whitespace — the same exclusions
  // as WORD, so in-word apostrophes and hyphens do not count twice.
  const punct = (rest.match(/[^\sA-Za-z0-9'’\-]/g) ?? []).length;
  return Math.ceil(cjk * 0.75 + words + punct);
}
