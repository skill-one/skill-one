/**
 * Extra metadata for one skill, carried by the index row itself (the
 * skill-one/skills-profiles dataset publishes `domain` inline on every
 * classified skill). Coverage is partial — only skills the profile
 * generator has processed carry a profile — so every consumer must treat the
 * whole field as optional garnish, never as a fact every skill has.
 */
export interface SkillProfile {
  /**
   * The dataset's classification: 1–3 domain keys, best fit first. The keys
   * are the generator's English enum (`development`, `data-analysis`, …);
   * `data/domains.ts` maps a key to its display label and icon. A skill may
   * legitimately belong to several, so grouping and filtering match by
   * membership.
   */
  domain: string[];
}

/**
 * A registry skill referenced by its identity fields only — the join key used
 * when a consumer knows which skill it means but does not hold the row (the
 * installed list's metadata lookup, resolved in the worker).
 */
export interface SkillRef {
  /** Source repository in "owner/repo" form. */
  repo: string;
  /** Skill name (the registry index's skillId). */
  name: string;
}

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
   * Directory the skill's files live in, relative to the skills-profiles
   * snapshot ("skills/{owner}/{repo}/{slug}"). Used to fetch the SKILL.md
   * directly from the snapshot without path probing; absent for installed
   * skills that the dataset does not list.
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
  /**
   * Classification metadata, carried by the index row. Absent for skills the
   * dataset has not classified (and for locally installed skills) — the skill
   * still works.
   */
  profile?: SkillProfile;
}

/**
 * A single skill's SKILL.md content, fetched from the skills-profiles
 * snapshot on demand when the detail sheet is opened.
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
