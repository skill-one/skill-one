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
  /** Lifetime install count recorded by skills.sh; 0 when absent. */
  downloads: number;
  /**
   * Directory the skill's files live in, relative to the skills-sh-mirror
   * mirror snapshot ("skills/{owner}/{repo}/{slug}"). Used to fetch the
   * SKILL.md directly from the mirror without path probing; absent for
   * installed skills that the mirror does not list.
   */
  path?: string;
  /**
   * SHA-256 content hash the scraper computed for the skill directory. The
   * authoritative identity of *which version of the skill* the snapshot
   * describes: it changes when any upstream file changes. Absent when the
   * scraper could not compute it.
   */
  rev?: string;
  /**
   * When the scraper first fetched this content version (ISO, UTC) — i.e. how
   * long the skill has been published in its current version, not when the
   * skill first appeared. Absent together with `rev`.
   */
  firstSeenAt?: string;
  /** The skill's page on skills.sh, when the index carries one. */
  url?: string;
}

/**
 * A single skill's SKILL.md content, fetched from the skills-sh-mirror
 * mirror on demand when the detail sheet is opened.
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
  /** Path the SKILL.md was found at, e.g. "skills/pdf/SKILL.md". */
  path: string;
}
