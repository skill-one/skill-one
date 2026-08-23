import { invoke } from "@tauri-apps/api/core";

import mockPagesData from "../data/skills-mock.json";
import type { Skill } from "../types/skill";
import { isTauri } from "./tauri";

/** Raw skill shape as returned by the Tauri `fetch_skills_page` command. */
interface RawSkill {
  source: string;
  skillId: string;
  /** Present in the old skills.sh snapshot; absent in the JSONL index. */
  name?: string;
  installs: number;
  weeklyInstalls: number[];
  /** Provided by the JSONL index; may be missing on individual entries. */
  description?: string;
}

/** Raw single page as returned by the Tauri `fetch_skills_page` command. */
interface RawPage {
  skills: RawSkill[];
  hasMore: boolean;
  total: number | null;
}

/** A page of skills mapped to the app's Skill model. */
export interface SkillsPage {
  skills: Skill[];
  hasMore: boolean;
  total: number | null;
}

/**
 * First 200 skills of the live JSONL index (single page) for plain browser
 * dev: the index is served from release-assets.githubusercontent.com without
 * CORS headers, so cross-origin reads are blocked and the UI is driven from
 * this static file instead of a live request.
 */
const MOCK_PAGES = mockPagesData as RawPage[];

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
  };
}

function toSkillsPage(raw: RawPage): SkillsPage {
  return {
    skills: raw.skills.filter((s) => isGitHubRepo(s.source)).map(toSkill),
    hasMore: raw.hasMore,
    total: raw.total,
  };
}

/**
 * Fetch one page (0-indexed) of skills.
 *
 * Inside a Tauri shell this goes through the `fetch_skills_page` command, which
 * downloads the full skills index (JSONL) from the skills-index GitHub release,
 * caches it and slices it into pages. In a plain browser (dev) it reads the
 * static snapshot above (the release CDN blocks cross-origin reads, so no live
 * request is attempted).
 * Caching is delegated to the data-fetching layer (TanStack Query) which owns
 * the freshness window and background revalidation.
 */
export async function fetchSkillsPage(page: number): Promise<SkillsPage> {
  if (isTauri()) {
    return toSkillsPage(await invoke<RawPage>("fetch_skills_page", { page }));
  }
  // Pages past the snapshot are empty, which ends pagination naturally.
  const mock = MOCK_PAGES[page];
  if (!mock) return { skills: [], hasMore: false, total: null };
  return toSkillsPage(mock);
}
