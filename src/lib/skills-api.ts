import type { Skill } from "../types/skill";
import { fetchFirstText, fileCandidates } from "./cdn-config";

/**
 * The skills-index repo publishes the full index (JSONL, one object per line)
 * to its `dist` orphan branch. It is fetched through the configurable download
 * source (direct GitHub raw by default, CDN fallback), which sends CORS headers
 * so it is fetchable from the WebView and a plain browser alike.
 */
const INDEX_SPEC = {
  repo: "skill-one/skills-index",
  path: "index.jsonl",
  ref: "dist",
} as const;

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
  /** GitHub stars of the source repo; absent on the old skills.sh snapshot. */
  stars?: number;
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
    // GitHub stars and install counts are separate metrics; entries missing
    // either (e.g. the old skills.sh snapshot) normalize to 0.
    stars: raw.stars ?? 0,
    downloads: raw.installs ?? 0,
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
  indexPromise ??= fetchFirstText(fileCandidates({ ...INDEX_SPEC }))
    .then(({ text }) => parseIndex(text))
    .catch((err: unknown) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

/**
 * Load the full skills index (cached per session). Exposed for callers that
 * need to join installed skills with registry metadata (downloads,
 * descriptions) rather than paginate, e.g. the "my skills" page.
 */
export function fetchFullIndex(): Promise<Skill[]> {
  return loadIndex();
}

/**
 * Fetch one page (0-indexed) of skills.
 *
 * Downloads the full index once (cached) through the configurable download
 * source, then slices it locally using the configured page size. Caching of
 * page data is delegated to TanStack Query, which owns the freshness window
 * and background revalidation.
 */
export async function fetchSkillsPage(
  page: number,
  pageSize: number = PAGE_SIZE,
): Promise<SkillsPage> {
  const skills = await loadIndex();
  const start = page * pageSize;
  const slice = skills.slice(start, start + pageSize);
  return {
    skills: slice,
    hasMore: start + pageSize < skills.length,
    total: skills.length,
  };
}
