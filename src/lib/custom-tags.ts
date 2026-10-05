import {
  DOMAINS,
  UNCLASSIFIED_DOMAIN,
  type DomainMeta,
} from "../data/domains";
import { domainsOf } from "./domain-filter";

/**
 * User-defined tags: the minimal taxonomy extension over the system domains.
 *
 * A tag's key *is* its trimmed label with whitespace folded to `-`, so a
 * Chinese label like `效率工具` works verbatim — no ASCII slug to invent and
 * nothing to transliterate. The key is what the ledger stores (`tag-def`
 * lines for definitions, `skill-tag` lines for one skill's choice) and what
 * the list scope carries; the label is what menus show. Validation keeps
 * three promises: a key is never empty, never collides with the system
 * taxonomy (or the facet's own `all` value), and never duplicates an
 * existing tag.
 */

/** The mark a user tag wears wherever a system domain wears its own emoji. */
export const CUSTOM_TAG_EMOJI = "🏷️";

/** The longest tag key the menus and the ledger accept. */
export const MAX_TAG_KEY_LENGTH = 32;

/** The most code points a tag mark may hold — one emoji, not a sticker row. */
export const MAX_TAG_EMOJI_LENGTH = 4;

/**
 * The mark a tag wears when the user gave it none: the label's first
 * character (uppercased for a lowercase latin initial, like an avatar's),
 * so an unmarked tag still scans as itself rather than as a generic tag.
 */
export function defaultTagMark(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return CUSTOM_TAG_EMOJI;
  try {
    for (const segment of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)) {
      const first = segment.segment;
      return /[a-z]/.test(first) ? first.toUpperCase() : first;
    }
  } catch {
    const first = Array.from(trimmed)[0];
    if (first !== undefined) return /[a-z]/.test(first) ? first.toUpperCase() : first;
  }
  return CUSTOM_TAG_EMOJI;
}

/** Keys no user tag may take: the system taxonomy, its blank, and facets. */
const RESERVED_TAG_KEYS = new Set([
  ...DOMAINS.map((domain) => domain.key.toLowerCase()),
  UNCLASSIFIED_DOMAIN,
  "all",
]);

/**
 * Fold a raw label into its tag key: trimmed, inner whitespace runs folded
 * to a single `-`. Returns "" when nothing usable is left.
 */
export function normalizeTagKey(label: string): string {
  return label.trim().replace(/\s+/g, "-");
}

/** Why a tag label was refused, for the menu to report. */
export type TagValidationError =
  | "empty"
  | "tooLong"
  | "reserved"
  | "duplicate"
  | "emojiLong";

/**
 * Fold a raw emoji field into the mark to store: trimmed, empty meaning the
 * label's first character. A picked emoji is one visible character — a ZWJ
 * family counts as one — while a sticker row does not; the former is kept,
 * the latter refused rather than truncated into a surprise.
 */
export function normalizeTagEmoji(
  input: string,
): { ok: true; emoji?: string } | { ok: false; error: TagValidationError } {
  const emoji = input.trim();
  if (emoji.length === 0) return { ok: true };
  if (!isSingleGrapheme(emoji)) return { ok: false, error: "emojiLong" };
  return { ok: true, emoji };
}

/** Whether the string reads as one visible character. */
function isSingleGrapheme(value: string): boolean {
  try {
    let count = 0;
    for (const _ of new Intl.Segmenter().segment(value)) {
      count += 1;
      if (count > 1) return false;
    }
    return count === 1;
  } catch {
    return Array.from(value).length <= MAX_TAG_EMOJI_LENGTH;
  }
}

/**
 * Check a new tag label against the key rules. System keys are always
 * reserved — no caller input needed — while `taken` carries the custom keys
 * already defined (see {@link collectTakenTagKeys}). On success answers the
 * key to store; the label itself is stored verbatim-trimmed beside it.
 */
export function validateNewTag(
  label: string,
  taken: ReadonlySet<string>,
): { ok: true; key: string } | { ok: false; error: TagValidationError } {
  const key = normalizeTagKey(label);
  if (key.length === 0) return { ok: false, error: "empty" };
  if (key.length > MAX_TAG_KEY_LENGTH) return { ok: false, error: "tooLong" };
  const lowered = key.toLowerCase();
  if (RESERVED_TAG_KEYS.has(lowered)) return { ok: false, error: "reserved" };
  for (const existing of taken) {
    if (existing.toLowerCase() === lowered) {
      return { ok: false, error: "duplicate" };
    }
  }
  return { ok: true, key };
}

/**
 * Every key a new tag must avoid: system domain keys, the unclassified key,
 * and the custom keys already defined. One set for the menu to pass to
 * {@link validateNewTag}, so the two can never disagree on what is taken.
 */
export function collectTakenTagKeys(
  customKeys: Iterable<string>,
): Set<string> {
  return new Set([
    ...DOMAINS.map((domain) => domain.key),
    UNCLASSIFIED_DOMAIN,
    ...customKeys,
  ]);
}

/**
 * The `DomainMeta` a user tag registers under (`data/domains`
 * `registerCustomTagMeta`): one user-given name for both locales, the tag's
 * own mark (or its first character when none was given) for an emoji, and
 * the label itself standing in for the scope description a system domain
 * carries. Enough for the badge, the glyph, the facets and the tooltip to
 * resolve a tag exactly like a domain.
 */
export function customTagMeta(
  key: string,
  label: string,
  emoji?: string,
): DomainMeta {
  const name = { en: label, zh: label };
  return { key, name, emoji: emoji ?? defaultTagMark(label), description: name };
}

/**
 * A skill's effective classification keys: its chosen tag when the user
 * picked one (system or custom — one override, the single select), else
 * whatever the store classified, else unclassified. The one function the
 * installed list reads instead of `domainsOf`, so filtering, facets, badges
 * and glyphs all answer the override without knowing it exists.
 */
export function effectiveDomains(
  skill: { profile?: { domain?: string[] } },
  assignment?: string | null,
): string[] {
  if (assignment) return [assignment];
  return domainsOf(skill);
}
