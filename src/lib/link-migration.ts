/**
 * Helpers for the "migrate existing skills, then link" confirmation flow.
 *
 * When an agent's skills directory already holds content, the backend refuses a
 * plain link and returns `LinkOutcome::Refused { skills, reason }`. The skill
 * names arrive structured, but non-skill files (strays) only appear inside the
 * reason text, so they are parsed here.
 *
 * The backend builds that text in four shapes, keyed by whether skills and
 * strays are empty (see `link_agent` in the `agents-skills` crate):
 *
 *   skills, no strays -> "<dir> has existing skills; rerun with --migrate ..."
 *   skills + strays   -> "<dir> has existing skills and non-skill files;
 *                         remove the files (<a, b>), then rerun with --migrate"
 *   strays only       -> "<dir> contains non-skill files; move them out and
 *                         rerun (migrate only moves skill directories): <a, b>"
 *   neither           -> "<dir> has existing content; rerun with --migrate ..."
 *
 * Both helpers are pure so they can be unit-tested without a backend.
 */

/** Wraps the stray list when skills are present too. */
const WITH_SKILLS_PREFIX = "; remove the files (";
const WITH_SKILLS_SUFFIX = "), then rerun with --migrate";

/**
 * Precedes the stray list when no skills were found. Anchoring on the whole
 * phrase matters: the same sentence contains an earlier parenthesised clause,
 * so looking for the first "(" would capture the wrong text.
 */
const STRAYS_ONLY_MARKER = "(migrate only moves skill directories): ";

/**
 * Non-skill files named in a refusal reason, in backend order.
 *
 * `skills` selects which sentence shape to expect, avoiding any guesswork:
 * a non-empty list means the "remove the files (...)" form, an empty one means
 * the strays-only form. Returns an empty array when the reason names no files.
 */
export function parseStrays(
  message: string | null | undefined,
  skills: string[],
): string[] {
  if (!message) return [];

  if (skills.length > 0) {
    const open = message.indexOf(WITH_SKILLS_PREFIX);
    if (open === -1) return [];
    const from = open + WITH_SKILLS_PREFIX.length;
    const close = message.indexOf(WITH_SKILLS_SUFFIX, from);
    if (close === -1) return [];
    return splitNames(message.slice(from, close));
  }

  const marker = message.indexOf(STRAYS_ONLY_MARKER);
  if (marker === -1) return [];
  return splitNames(message.slice(marker + STRAYS_ONLY_MARKER.length));
}

/** A skill awaiting migration, plus whether the backend will skip it. */
export interface MigrationSkill {
  name: string;
  /**
   * True when the canonical dir already holds a skill of this name. Migration
   * leaves such copies in place and keeps the canonical version instead.
   */
  skipped: boolean;
}

/** Tag each skill that the canonical dir already provides as "will be kept". */
export function classifySkills(
  skills: string[],
  installedNames: Iterable<string>,
): MigrationSkill[] {
  const installed = new Set(installedNames);
  return skills.map((name) => ({ name, skipped: installed.has(name) }));
}

function splitNames(raw: string): string[] {
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}
