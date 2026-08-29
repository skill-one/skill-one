import type { SkillDetail } from "../types/skill";
import { SourceFetchError, fetchFirstText, fileCandidates } from "./cdn-config";

/** Frontmatter fields surfaced in the detail view. */
const FRONTMATTER_FIELDS = [
  "name",
  "description",
  "license",
  "version",
  "author",
] as const;

type FrontmatterField = (typeof FRONTMATTER_FIELDS)[number];

type Frontmatter = Partial<Record<FrontmatterField, string>>;

/**
 * Fetch a skill's SKILL.md from its source GitHub repo.
 *
 * The file is fetched through the configurable download source (direct GitHub
 * raw by default, with a jsDelivr-mirror CDN fallback), which works identically
 * in a plain browser and inside the Tauri WebView and is reliably reachable
 * from mainland China. Caching (and persistence across restarts) is delegated
 * to TanStack Query.
 *
 * `knownPath` is the skill's directory as recorded in the registry index
 * (e.g. "skills/find-skills") and always present for registry skills, so the
 * SKILL.md resolves in a single request. A missing or stale path throws.
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
    const { text } = await fetchFirstText(fileCandidates({ repo, path }));
    return toDetail(text, skillId, path);
  } catch (err) {
    // A 404 on every candidate means the index path is stale or the file was
    // removed — worth a precise "not found". Anything else (network failure,
    // timeout, server error) is a connectivity problem, so name the underlying
    // cause instead of misreporting it as a missing file.
    if (err instanceof SourceFetchError && err.kind === "http" && err.status === 404) {
      throw new Error(`SKILL.md for ${skillId} not found in ${repo}`);
    }
    throw new Error(
      `无法获取 ${skillId} 的 SKILL.md：${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Split a SKILL.md into frontmatter fields and the markdown body.
 *
 * Only single-line `key: value` scalars are supported (optionally quoted) —
 * enough for the flat frontmatter agents write. Block scalars (`>`, `|`),
 * comments and unknown keys are ignored, and a file without frontmatter is
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
  for (const line of lines.slice(0, end)) {
    if (line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = unquote(line.slice(colon + 1).trim());
    const isField = (FRONTMATTER_FIELDS as readonly string[]).includes(key);
    const isBlockScalar = value.startsWith(">") || value.startsWith("|");
    if (isField && value && !isBlockScalar) {
      frontmatter[key as FrontmatterField] = value;
    }
  }
  return {
    frontmatter,
    body: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
  };
}

/** Strip one pair of matching surrounding single or double quotes. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.at(-1) === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function toDetail(raw: string, skillId: string, path: string): SkillDetail {
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    name: frontmatter.name ?? skillId,
    description: frontmatter.description ?? "",
    license: frontmatter.license,
    version: frontmatter.version,
    author: frontmatter.author,
    instructions: body,
    path,
  };
}
