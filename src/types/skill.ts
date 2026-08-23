export interface Skill {
  /** Skill name, e.g. "algorithmic-art" */
  name: string;
  /** Source repository in "owner/repo" form, e.g. "vercel-labs/skills" */
  repo: string;
  /**
   * Short human-readable description (shown truncated to 2 lines on the card).
   * The skills.sh API does not expose descriptions yet, so this is kept as an
   * empty placeholder for future expansion.
   */
  description: string;
  /** Popularity metric, sourced from skills.sh install counts (e.g. 2_991_984). */
  stars: number;
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
  /** Frontmatter `version`, when present. */
  version?: string;
  /** Frontmatter `author`, when present. */
  author?: string;
  /** Markdown body below the frontmatter. */
  instructions: string;
  /** Repo path the SKILL.md was found at, e.g. "skills/pdf/SKILL.md". */
  path: string;
}
