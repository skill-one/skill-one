export interface Skill {
  /** Skill name, e.g. "algorithmic-art" */
  name: string;
  /** Source repository in "owner/repo" form, e.g. "vercel-labs/skills" */
  repo: string;
  /**
   * Short human-readable description (shown on one truncated line in a row).
   */
  description: string;
  /** GitHub star count of the source repo; 0 when the index entry lacks it. */
  stars: number;
  /** Lifetime install count recorded by the registry; 0 when absent. */
  downloads: number;
  /**
   * Installs recorded over the most recent week (the last entry of the
   * registry's weekly install series); absent when the entry carries no
   * weekly data.
   */
  weeklyInstalls?: number;
  /**
   * Skill directory inside the repo as recorded by the registry index (e.g.
   * "skills/find-skills"); absent on the old skills.sh snapshot. Used to fetch
   * the SKILL.md directly without path probing.
   */
  path?: string;
  /**
   * Content fingerprint the registry computed for the skill directory (e.g.
   * "t1-a4cf6ce14f6d65b3"; the `t1` segment is the fingerprint scheme). The
   * authoritative identity of *which version of the skill* the index describes:
   * it changes when any file in the directory changes, including its mode.
   * Absent on entries whose repository content was never scanned.
   */
  rev?: string;
  /**
   * When the registry first recorded this `rev` (ISO, UTC) — i.e. how long the
   * skill has been published in its current version, not when the skill first
   * appeared. Absent together with `rev`.
   */
  firstSeenAt?: string;
}

/**
 * A single skill's SKILL.md content, fetched from its source repo on demand
 * when the detail sheet is opened.
 */
export interface SkillDetail {
  /** Frontmatter `name`, falling back to the registry skill id. */
  name: string;
  /** Frontmatter `description`; empty when the file has none. */
  description: string;
  /** Frontmatter `license`, when present. */
  license?: string;
  /** Frontmatter `author`, when present. */
  author?: string;
  /** Markdown body below the frontmatter. */
  instructions: string;
  /** Repo path the SKILL.md was found at, e.g. "skills/pdf/SKILL.md". */
  path: string;
}
