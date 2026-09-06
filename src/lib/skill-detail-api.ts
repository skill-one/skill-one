import { parse as parseYaml } from "yaml";

import type { SkillDetail } from "../types/skill";
import { errorMessage } from "./utils";
import { SourceFetchError, fetchFirstText, fileCandidates } from "./cdn-config";

/**
 * The skills-sh-scraper repo mirrors every indexed skill's full files on its
 * `dist` branch — the same snapshot the registry index was built from. The
 * index and the mirror are guaranteed to match (a row exists if and only if
 * its directory exists), so a registry-known path resolves in one request.
 */
export const MIRROR = {
  repo: "skill-one/skills-sh-scraper",
  ref: "dist",
} as const;

/** Frontmatter fields surfaced in the detail view. */
const FRONTMATTER_FIELDS = [
  "name",
  "description",
  "license",
  "author",
] as const;

type FrontmatterField = (typeof FRONTMATTER_FIELDS)[number];

type Frontmatter = Partial<Record<FrontmatterField, string>>;

/**
 * Fetch a skill's SKILL.md from the skills-sh-scraper mirror snapshot.
 *
 * The file is fetched through the configurable download source (direct GitHub
 * raw by default, with a jsDelivr-mirror CDN fallback), which works identically
 * in a plain browser and inside the Tauri WebView and is reliably reachable
 * from mainland China. Caching (and persistence across restarts) is delegated
 * to TanStack Query.
 *
 * `knownPath` is the skill's directory inside the mirror snapshot
 * ("skills/{owner}/{repo}/{slug}", as recorded in the registry index) and
 * always present for registry skills, so the SKILL.md resolves in a single
 * request. A missing or stale path throws.
 */
export async function fetchSkillDetail(
  repo: string,
  skillId: string,
  knownPath?: string,
): Promise<SkillDetail> {
  if (!knownPath) {
    throw new Error(`SKILL.md for ${skillId} not found in ${repo}`);
  }
  const path = `${knownPath.replace(/\/+$/, "")}/SKILL.md`;
  try {
    const { text } = await fetchFirstText(
      fileCandidates({ repo: MIRROR.repo, ref: MIRROR.ref, path }),
    );
    return toDetail(text, skillId, path);
  } catch (err) {
    // A 404 on every candidate means the mirror no longer ships this
    // directory (a stale registry entry) — worth a precise "not found".
    // Anything else (network failure, timeout, server error) is a
    // connectivity problem, so name the underlying cause instead of
    // misreporting it as a missing file.
    if (err instanceof SourceFetchError && err.kind === "http" && err.status === 404) {
      throw new Error(`SKILL.md for ${skillId} not found in ${repo}`, {
        cause: err,
      });
    }
    throw new Error(`无法获取 ${skillId} 的 SKILL.md：${errorMessage(err)}`, {
      cause: err,
    });
  }
}

/**
 * Split a SKILL.md into frontmatter fields and the markdown body.
 *
 * The frontmatter block is parsed with the `yaml` package, so block scalars
 * (`>`, `|`), quoted values, comments and nesting all follow the YAML spec.
 * Only the flat string fields the detail view shows are kept — everything
 * else is ignored. A file without frontmatter (or with unparsable YAML) is
 * treated as pure body text.
 */
export function parseFrontmatter(raw: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const text = raw.replace(/^\uFEFF/, "").trimStart();
  if (!text.startsWith("---")) return { frontmatter: {}, body: raw.trim() };

  const lines = text.slice(3).split("\n");
  const end = lines.findIndex((line) => {
    const t = line.trimEnd();
    return t === "---" || t === "...";
  });
  if (end === -1) return { frontmatter: {}, body: raw.trim() };

  const frontmatter: Frontmatter = {};
  try {
    const data: unknown = parseYaml(lines.slice(0, end).join("\n"));
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      for (const field of FRONTMATTER_FIELDS) {
        const value = record[field];
        if (typeof value === "string") frontmatter[field] = value;
        // YAML parses `license: 2` as a number; keep it displayable.
        else if (typeof value === "number") frontmatter[field] = String(value);
      }
    }
  } catch {
    // Malformed YAML should not hide the body — drop the fields only.
  }
  return {
    frontmatter,
    body: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
  };
}

/** Split a raw SKILL.md into the shape the detail view consumes. */
export function toDetail(raw: string, skillId: string, path: string): SkillDetail {
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    name: frontmatter.name ?? skillId,
    description: frontmatter.description ?? "",
    license: frontmatter.license,
    author: frontmatter.author,
    instructions: body,
    path,
  };
}
