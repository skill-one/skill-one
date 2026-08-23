import type { SkillDetail } from "../types/skill";

/**
 * Repo layouts probed for a skill's SKILL.md, in order of prevalence.
 */
const SKILL_PATH_PATTERNS = [
  "skills/{id}/SKILL.md",
  "{id}/SKILL.md",
  ".skills/{id}/SKILL.md",
  "agent-skills/{id}/SKILL.md",
] as const;

/** Branches probed in order; "main" covers modern repos, "master" older ones. */
const BRANCHES = ["main", "master"] as const;

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
 * raw.githubusercontent.com and api.github.com both serve CORS headers, so
 * this works identically in a plain browser and inside the Tauri WebView —
 * unlike the registry index, which needs the Rust proxy. Caching (and
 * persistence across restarts) is delegated to TanStack Query.
 */
export async function fetchSkillDetail(
  repo: string,
  skillId: string,
): Promise<SkillDetail> {
  const ids = [skillId];
  const simplified = simplifiedSkillId(skillId);
  if (simplified) ids.push(simplified);

  for (const branch of BRANCHES) {
    for (const id of ids) {
      for (const pattern of SKILL_PATH_PATTERNS) {
        const path = pattern.replace("{id}", id);
        const raw = await fetchText(
          `https://raw.githubusercontent.com/${repo}/${branch}/${path}`,
        );
        if (raw != null) return toDetail(raw, skillId, path);
      }
    }
  }

  const detail = await findInTree(repo, skillId);
  if (detail) return detail;

  throw new Error(`SKILL.md for ${skillId} not found in ${repo}`);
}

/**
 * Drop a leading lowercase word from the skill id: registry ids often prefix
 * the repo's own directory name ("vercel-react-best-practices" →
 * "react-best-practices").
 */
export function simplifiedSkillId(skillId: string): string | null {
  const idx = skillId.indexOf("-");
  if (idx <= 0) return null;
  const prefix = skillId.slice(0, idx);
  return /^[a-z]+$/.test(prefix) ? skillId.slice(idx + 1) : null;
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
  return { frontmatter, body: lines.slice(end + 1).join("\n").trim() };
}

/** GET a URL and return its text body, or null for any error/non-2xx. */
async function fetchText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    return resp.ok ? await resp.text() : null;
  } catch {
    return null;
  }
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

interface TreeEntry {
  type: string;
  path: string;
}

/**
 * Last resort: search the whole repo tree for any SKILL.md via the GitHub
 * API, covering repos with non-standard layouts. Unauthenticated API calls
 * are rate limited (60/h per IP), so this only runs when every conventional
 * path has failed.
 */
async function findInTree(
  repo: string,
  skillId: string,
): Promise<SkillDetail | null> {
  for (const branch of BRANCHES) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
        { headers: { Accept: "application/vnd.github.v3+json" } },
      );
      if (!resp.ok) continue;
      const { tree } = (await resp.json()) as { tree: TreeEntry[] };
      const entry = tree.find(
        (item) =>
          item.type === "blob" &&
          (item.path === "SKILL.md" || item.path.endsWith("/SKILL.md")),
      );
      if (!entry) continue;
      const raw = await fetchText(
        `https://raw.githubusercontent.com/${repo}/${branch}/${entry.path}`,
      );
      if (raw != null) return toDetail(raw, skillId, entry.path);
    } catch {
      continue;
    }
  }
  return null;
}
