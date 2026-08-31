import type { Skill } from "../../types/skill";

/**
 * Pure parsing of the registry index's JSONL lines into the app's Skill
 * model. Runs inside the registry worker, one line at a time while the
 * download streams in.
 */

/** Raw skill shape as stored in one JSONL index line. */
interface RawSkill {
  source: string;
  skillId: string;
  /** Present in the old skills.sh snapshot; absent in the JSONL index. */
  name?: string;
  installs: number;
  /** Absent on some live index lines despite always being drawn. */
  weeklyInstalls?: number[];
  /** Provided by the JSONL index; may be missing on individual entries. */
  description?: string;
  /** Skill directory inside the repo, e.g. "skills/find-skills". */
  path?: string;
  /** GitHub stars of the source repo; absent on the old skills.sh snapshot. */
  stars?: number;
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
    // The registry records a weekly install series in chronological order;
    // the featured page ranks by the most recent week, its last entry. The
    // field is absent on some index lines, so guard before reading it.
    weeklyInstalls:
      raw.weeklyInstalls && raw.weeklyInstalls.length > 0
        ? raw.weeklyInstalls[raw.weeklyInstalls.length - 1]
        : undefined,
    path: raw.path,
  };
}

/**
 * Parse one JSONL index line into a GitHub skill. Returns null for blank
 * lines, malformed JSON, and entries that are not GitHub repos — the same
 * skips the previous whole-text parse applied.
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
  return isGitHubRepo(raw.source) ? toSkill(raw) : null;
}
