import type { Skill } from "../types/skill";

/**
 * Full skills index (JSONL, one JSON object per line) published by the
 * skills-index repo to its orphan `dist` branch. Served through JSDMirror —
 * a jsDelivr mirror that sends CORS headers (unlike GitHub release assets) —
 * so it is fetchable directly from the WebView and a plain browser alike.
 */
const INDEX_URL =
  "https://cdn.jsdmirror.com/gh/luckie2076/skills-index@dist/index.jsonl";

/** Number of skills returned per page (matches the previous Rust page size). */
const PAGE_SIZE = 200;

/** Raw skill shape as stored in one JSONL index line. */
interface RawSkill {
  source: string;
  skillId: string;
  /** Present in the old skills.sh snapshot; absent in the JSONL index. */
  name?: string;
  installs: number;
  weeklyInstalls: number[];
  /** Provided by the JSONL index; may be missing on individual entries. */
  description?: string;
  /** Skill directory inside the repo, e.g. "skills/find-skills". */
  path?: string;
}

/** A page of skills mapped to the app's Skill model. */
export interface SkillsPage {
  skills: Skill[];
  hasMore: boolean;
  total: number | null;
}

/**
 * Whether a source is a GitHub repo in "owner/repo" form.
 *
 * The index also lists non-GitHub sources (e.g. "open.feishu.cn"), which
 * would otherwise produce broken `https://github.com/<source>.png` avatar URLs
 * and are not addressable repos, so they are filtered out.
 */
function isGitHubRepo(source: string): boolean {
  const parts = source.split("/");
  return (
    parts.length === 2 &&
    parts[0].length > 0 &&
    parts[1].length > 0 &&
    // GitHub usernames never contain a dot; a dot means a domain (e.g.
    // "open.feishu.cn") rather than an owner.
    !parts[0].includes(".")
  );
}

function toSkill(raw: RawSkill): Skill {
  return {
    // The JSONL index has no separate `name` field; the skill name lives in
    // `skillId` (the old skills.sh snapshot still carries both).
    name: raw.name ?? raw.skillId,
    repo: raw.source,
    // The JSONL index exposes descriptions; fall back to an empty placeholder
    // when an entry lacks one so the card layout stays stable.
    description: raw.description ?? "",
    stars: raw.installs,
    path: raw.path,
  };
}

/**
 * Parse the JSONL index into a list of GitHub skills, skipping blank lines
 * and entries that are malformed or not GitHub repos.
 */
function parseIndex(text: string): Skill[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as RawSkill];
      } catch {
        return [];
      }
    })
    .filter((raw) => isGitHubRepo(raw.source))
    .map(toSkill);
}

/**
 * Cached download of the full index. The JSONL file (~12MB) is fetched once
 * per session and shared across pagination requests; a failed download clears
 * the cache so the next call retries. Freshness across restarts is delegated
 * to the data-fetching layer (TanStack Query).
 */
let indexPromise: Promise<Skill[]> | null = null;

function loadIndex(): Promise<Skill[]> {
  indexPromise ??= fetch(INDEX_URL)
    .then((resp) => {
      if (!resp.ok) throw new Error(`index request failed: ${resp.status}`);
      return resp.text();
    })
    .then(parseIndex)
    .catch((err: unknown) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

/**
 * Fetch one page (0-indexed) of skills.
 *
 * Downloads the full index from JSDMirror on first call (then cached) and
 * slices it locally. Caching of page data is delegated to TanStack Query,
 * which owns the freshness window and background revalidation.
 */
export async function fetchSkillsPage(page: number): Promise<SkillsPage> {
  const skills = await loadIndex();
  const start = page * PAGE_SIZE;
  const slice = skills.slice(start, start + PAGE_SIZE);
  return {
    skills: slice,
    hasMore: start + PAGE_SIZE < skills.length,
    total: skills.length,
  };
}
