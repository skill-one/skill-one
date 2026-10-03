import type { Skill } from "../../types/skill";
import { count, record, text } from "../value";

/**
 * Pure parsing of the skills-profiles catalog's JSONL lines into the app's
 * Skill model. Runs inside the registry worker, one line at a time while the
 * download streams in.
 *
 * The upstream catalog is self-contained: a row carries the skill's own fields
 * plus the profile classification (`domain`) the dataset generated for it, so
 * one parsed line yields the fully decorated skill — nothing is merged in
 * afterwards.
 *
 * Star counts are the one exception: they are not carried by the catalog rows
 * themselves but kept in a separate `repos.jsonl` (one row per GitHub repo),
 * which is joined in at parse time through the `starsFor` callback — see
 * `readRepos` in `index-stream.ts`.
 */

/** Raw skill shape as stored in one JSONL catalog line. */
interface RawSkill {
  /**
   * Canonical skills.sh id encoding source and slug: `{owner}/{repo}/{slug}`,
   * spelled the way the mirror lists it. The slug is slash-free —
   * multi-segment slugs upstream are keyed with the slashes stripped.
   */
  id: string;
  /**
   * The skill's frontmatter `name`, as the mirror spells it. Carried as
   * `displayName` when it folds to a different string than the slug — the
   * human-readable rendition the UI shows — while the slug stays the one
   * identity every consumer shares (see `toSkill`).
   */
  name?: string | null;
  installs: number;
  /**
   * Directory the skill's files live at, relative to `skills/` — the row's
   * own `owner/repo` leading a path that can differ from the id's spelling.
   * Null while the repository has not been fetched.
   */
  dir?: string | null;
  /** From the SKILL.md frontmatter; null when it has none. */
  description?: string | null;
  /** Chinese translation of `description`; null when untranslated. */
  description_zh?: string | null;
  /**
   * The dataset's classification: one closed English category
   * (`development`, `data-analysis`, …). Null for skills the generator has
   * not reached.
   */
  domain?: unknown;
  /**
   * The classifier's own reading of how close the call was (0–1); null when
   * it does not say. Published to be sorted on, not trusted as a probability.
   */
  confidence?: unknown;
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
  // Upstream answers one closed category per skill; the model keeps a list so
  // grouping and filtering can match by membership.
  const domain = text(raw.domain);
  const confidence = count(raw.confidence);
  return {
    // The name is the id's slug — the skills.sh identity, not the frontmatter
    // `name` verbatim. The slug is what a locally installed copy is called
    // (agents-skills matches installs by the slugified frontmatter `name`),
    // what the live skills.sh search reports (`skillId`), and the id's own
    // last segment installs rebuild from — holding the raw spelling instead
    // would split the name into two currencies that only agree while upstream
    // declares no casing or spaces the fold removes. The raw spelling rides
    // along as `displayName` when it differs, which is what the UI shows.
    name: slug,
    // The id is what install hands to the backend, verbatim — no rebuild
    // from repo plus slug at the call site.
    id: raw.id,
    repo: repoId,
    ...(raw.name && raw.name !== slug ? { displayName: raw.name } : {}),
    // Upstream exposes descriptions; fall back to an empty placeholder
    // when an entry lacks one so the row layout stays stable.
    description: raw.description ?? "",
    // The Chinese translation is optional: a missing one is resolved as an
    // English fallback at the rendering layer, not here.
    descriptionZh: raw.description_zh ?? undefined,
    // GitHub stars come from the joined repos.jsonl rows, not the skill row
    // itself; an unjoined repo (missing row, null count) normalizes to 0.
    stars: starsFor?.(repoId) ?? 0,
    // Install counts are separate metrics; an entry missing one normalizes
    // to 0.
    downloads: raw.installs ?? 0,
    // The skill's files live in the snapshot at `skills/<dir>`; `dir` is the
    // row's own spelling of where they are and wins over the id. Its basename
    // is the source repository's own directory name, which is *not* the slug:
    // 173 of 8,214 published rows (2.1%) spell the two differently. A local
    // copy is matched by its slug, so the basename is a second key rather than
    // a restatement of the first — see `lookupIndex` and `namesakeIndex`.
    path: `skills/${text(raw.dir) || raw.id}`,
    // The skill's page on skills.sh is derivable from the id.
    url: `https://www.skills.sh/${raw.id}`,
    ...(domain ? { profile: { domain: [domain], ...(
      confidence !== undefined ? { confidence } : {}
    ) } } : {}),
  };
}

/**
 * One streamed JSONL line as a raw record: null for a blank line, malformed
 * JSON, or a value that is not an object. The single definition of what a
 * snapshot line is, shared by the catalog rows (`parseSkillLine`) and the
 * repos sidecar (see `readRepos` in `index-stream.ts`).
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
 * Parse one JSONL catalog line into a GitHub skill. Returns null for a line
 * that is not a usable record (see `jsonLine`), and for ids that are not
 * canonical GitHub ids.
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
