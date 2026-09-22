import type { Skill } from "../../types/skill";
import { record, text, textList } from "../value";

/**
 * Pure parsing of the skills-profiles index's JSONL lines into the app's
 * Skill model. Runs inside the registry worker, one line at a time while the
 * download streams in.
 *
 * The upstream index is self-contained: a row carries the skill's own fields
 * plus the profile classification (`domain`) the dataset generated for it, so
 * one parsed line yields the fully decorated skill — nothing is merged in
 * afterwards.
 *
 * Star counts are the one exception: they are not carried by the index rows
 * themselves but kept in a separate `upstream/repos.jsonl` (one row per
 * GitHub repo), which is joined in at parse time through the `starsFor`
 * callback — see `readRepos` in `index-stream.ts`.
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
  /** The skill's page on skills.sh. */
  url?: string | null;
  /** From the SKILL.md frontmatter; null when it has none. */
  description?: string | null;
  /** SHA-256 of the skill's files; null when unknown. */
  hash?: string | null;
  /** When the current content version was first fetched (ISO, UTC). */
  fetchedAt?: string | null;
  /**
   * The dataset's classification. The snapshot publishes one key per skill as a
   * bare string (`"domain": "development"`); the model is a list because it has
   * carried 1–3 keys, best fit first, and can again. Absent for skills the
   * generator has not reached.
   */
  domain?: unknown;
}

/**
 * Whether an id is a canonical skills.sh id for a GitHub repo.
 *
 * The dataset only lists GitHub-sourced skills, but a defensive shape check
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

/**
 * Repo → star-count lookup over the parsed `repos.jsonl` rows. Missing keys
 * (a repo row that never arrived, or a deleted repo whose `stars` is null
 * upstream) normalize to 0.
 */
export type StarsFor = (repo: string) => number | undefined;

function toSkill(raw: RawSkill, starsFor: StarsFor | undefined): Skill {
  const [owner, repo, slug] = raw.id.split("/");
  const repoId = `${owner}/${repo}`;
  // Classification is optional garnish: a skill the generator has not reached
  // simply carries no profile, and every consumer already treats it that way.
  // The snapshot's own shape has moved between a bare key and a list of them,
  // so both are read — a row whose `domain` is missing, empty or of some other
  // type lands on the same "no profile" shape rather than a half-filled one.
  const one = text(raw.domain);
  const domains = textList(raw.domain) ?? (one ? [one] : []);
  return {
    // The slug is the skill's name: the directory the skill ships in, and
    // what a locally installed copy of it is called.
    name: slug,
    repo: repoId,
    // Upstream exposes descriptions; fall back to an empty placeholder
    // when an entry lacks one so the row layout stays stable.
    description: raw.description ?? "",
    // GitHub stars come from the joined repos.jsonl rows, not the skill row
    // itself; an unjoined repo (missing row, null count) normalizes to 0.
    stars: starsFor?.(repoId) ?? 0,
    // Install counts are separate metrics; an entry missing one normalizes
    // to 0.
    downloads: raw.installs ?? 0,
    // The skill's files live in the snapshot at this directory; the basename
    // equals the skill name, so a locally installed copy still matches its
    // registry entry.
    path: `skills/${raw.id}`,
    rev: raw.hash ?? undefined,
    firstSeenAt: raw.fetchedAt ?? undefined,
    url: raw.url ?? undefined,
    ...(domains.length > 0 ? { profile: { domain: domains } } : {}),
  };
}

/**
 * One streamed JSONL line as a raw record: null for a blank line, malformed
 * JSON, or a value that is not an object. The single definition of what a
 * snapshot line is, shared by the index rows (`parseSkillLine`) and the repos
 * sidecar (see `readRepos` in `index-stream.ts`).
 */
export function jsonLine<T extends object>(line: string): T | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  return record<T>(raw);
}

/**
 * Parse one JSONL index line into a GitHub skill. Returns null for a line that
 * is not a usable record (see `jsonLine`), and for ids that are not canonical
 * GitHub ids.
 *
 * `starsFor` supplies the source repo's GitHub star count (see `StarsFor`);
 * omitting it leaves every skill with 0 stars — the graceful shape when the
 * repos.jsonl sidecar could not be fetched.
 */
export function parseSkillLine(
  line: string,
  starsFor?: StarsFor,
): Skill | null {
  const raw = jsonLine<RawSkill>(line);
  return raw && typeof raw.id === "string" && isCanonicalId(raw.id)
    ? toSkill(raw, starsFor)
    : null;
}
