import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import type { SkillView } from "./skill-view";
import { isTauri } from "./tauri";

/**
 * skills.sh's live search — the store's second answer source.
 *
 * The public site's own search endpoint (the one its search box calls) needs
 * no account and answers with JSON:
 *
 *     GET https://www.skills.sh/api/search?q=<term>&limit=<1..200>
 *
 * A hit carries only what a leaderboard row needs — the skill's slug, its
 * source repository and its install count — so a live result is thinner than
 * an indexed one: no description, no stars, no SKILL.md path. What it adds is
 * reach: it answers over skills.sh's catalog as it stands right now, including
 * skills the app's daily index snapshot has not published yet.
 *
 * The endpoint serves no CORS headers, so a WebView cannot read it directly.
 * Inside Tauri the request goes through the HTTP plugin (the Rust side, where
 * same-origin policy does not apply — see `src-tauri/capabilities/default.json`
 * for the allowed origin); in a plain browser it goes through the dev server's
 * proxy for the same path (see `vite.config.ts`), which makes it same-origin
 * for the browser demo.
 */

/** The endpoint's own floor: a shorter query is answered with an error. */
export const SKILLS_SH_MIN_QUERY = 2;

/**
 * How many hits to ask for. The endpoint defaults to 100 and caps at 200; the
 * store dedupes the answer against the local one and previews only its first
 * rows, so a mid-size page is enough to be exhaustive without being wasteful.
 */
export const SKILLS_SH_LIMIT = 50;

const ORIGIN = "https://www.skills.sh";
const SEARCH_PATH = "/api/search";

/** Dev-server proxy path — the same endpoint, served same-origin. */
const PROXY_PATH = "/skills-sh/api/search";

/** One skill as the live search returns it. */
export interface SkillsShHit {
  /** Canonical skills.sh id: `{source}/{skillId}`. */
  id: string;
  /** URL-safe slug — the skill's name in this app's model. */
  skillId: string;
  /** Display name; upstream currently repeats the slug. */
  name: string;
  /** Lifetime install count. */
  installs: number;
  /** Source repository (`owner/repo`) or discovery domain. */
  source: string;
}

/** Whether a hit carries every field this app reads. */
function isHit(value: unknown): value is SkillsShHit {
  if (typeof value !== "object" || value === null) return false;
  const hit = value as Record<string, unknown>;
  return (
    typeof hit.id === "string" &&
    typeof hit.skillId === "string" &&
    typeof hit.source === "string"
  );
}

/**
 * One live hit in this app's skill model. `name`/`repo` are the same pair the
 * registry index keys a skill by, so a live row dedupes against an indexed one
 * by identity alone.
 *
 * `storeBacked: false` is what the thinness means on the card: this skill has
 * no entry in the index the app reads (that is why it is a live row at all), so
 * it carries no classification and no stars. It does publish an install count —
 * a real one — but the card draws figures only for rows the store vouches for,
 * so a live row stays figure-less rather than putting a second kind of figure
 * beside the store's.
 */
function toSkill(hit: SkillsShHit): SkillView {
  return {
    name: hit.skillId,
    repo: hit.source,
    description: "",
    stars: 0,
    downloads: typeof hit.installs === "number" ? hit.installs : 0,
    url: `${ORIGIN}/${hit.id}`,
    storeBacked: false,
  };
}

/** Whether a query is long enough for the endpoint to answer it. */
export function isSearchableQuery(query: string): boolean {
  return query.trim().length >= SKILLS_SH_MIN_QUERY;
}

/**
 * Live skills.sh search, in the endpoint's own relevance order. Throws on a
 * non-OK answer; callers treat a failure as "no live results", since the live
 * answer only ever supplements the local one.
 */
export async function searchSkillsSh(
  query: string,
  signal?: AbortSignal,
): Promise<SkillView[]> {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(SKILLS_SH_LIMIT),
  });
  const url = isTauri()
    ? `${ORIGIN}${SEARCH_PATH}?${params}`
    : `${PROXY_PATH}?${params}`;
  const response = isTauri()
    ? await tauriFetch(url, { method: "GET", signal })
    : await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`skills.sh 搜索失败（HTTP ${response.status}）`);
  }
  const body = (await response.json()) as { skills?: unknown };
  const hits = Array.isArray(body.skills) ? body.skills : [];
  return hits.filter(isHit).map(toSkill);
}
