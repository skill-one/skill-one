import type { Skill } from "../../types/skill";

/**
 * Pure parsing of the skills-sh-mirror index's JSONL lines into the app's
 * Skill model. Runs inside the registry worker, one line at a time while the
 * download streams in.
 */

/** Raw skill shape as stored in one JSONL index line. */
interface RawSkill {
  /**
   * Canonical skills.sh id encoding source and slug: `{owner}/{repo}/{slug}`.
   * The slug is slash-free — multi-segment slugs upstream are keyed with the
   * slashes stripped.
   */
  id: string;
  installs: number;
  /** GitHub stargazers of the source repo; null when the repo is gone. */
  stars?: number | null;
  /** The skill's page on skills.sh. */
  url?: string | null;
  /** From the SKILL.md frontmatter; null when it has none. */
  description?: string | null;
  /** SHA-256 of the skill's files; null when unknown. */
  hash?: string | null;
  /** When the current content version was first fetched (ISO, UTC). */
  fetchedAt?: string | null;
}

/**
 * Whether an id is a canonical skills.sh id for a GitHub repo.
 *
 * The mirror only lists GitHub-sourced skills, but a defensive shape check
 * keeps a malformed line from interpolating junk into download URLs and
 * avatar paths: exactly three non-empty segments, and a dot-free owner (a
 * dotted first segment would be a domain, not a GitHub user).
 */
export function isCanonicalId(id: string): boolean {
  const parts = id.split("/");
  return (
    parts.length === 3 &&
    parts.every((part) => part.length > 0) &&
    !parts[0].includes(".")
  );
}

function toSkill(raw: RawSkill): Skill {
  const [owner, repo, slug] = raw.id.split("/");
  return {
    // The slug is the skill's name: the directory the skill ships in, and
    // what a locally installed copy of it is called.
    name: slug,
    repo: `${owner}/${repo}`,
    // The mirror exposes descriptions; fall back to an empty placeholder
    // when an entry lacks one so the row layout stays stable.
    description: raw.description ?? "",
    // GitHub stars and install counts are separate metrics; an entry
    // missing either (a deleted repo, a null count) normalizes to 0.
    stars: raw.stars ?? 0,
    downloads: raw.installs ?? 0,
    // The skill's files live in the mirror snapshot at this directory; the
    // basename equals the skill name, so a locally installed copy still
    // matches its registry entry.
    path: `skills/${raw.id}`,
    rev: raw.hash ?? undefined,
    firstSeenAt: raw.fetchedAt ?? undefined,
    url: raw.url ?? undefined,
  };
}

/**
 * Parse one JSONL index line into a GitHub skill. Returns null for blank
 * lines, malformed JSON, and ids that are not canonical GitHub ids.
 */
export function parseSkillLine(line: string): Skill | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let raw: RawSkill;
  try {
    raw = JSON.parse(trimmed) as RawSkill;
  } catch {
    return null;
  }
  return typeof raw.id === "string" && isCanonicalId(raw.id)
    ? toSkill(raw)
    : null;
}
