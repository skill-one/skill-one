/**
 * Extra metadata for one skill, merged in from the skill-one/skills-profiles
 * dataset (its `dist` branch ships one JSONL line per profiled skill).
 * Coverage is partial — only skills the profile generator has processed
 * carry a profile — so every consumer must treat the whole field as
 * optional garnish, never as a fact every skill has.
 */
export interface SkillProfile {
  /** One of the dataset's fixed domain categories, e.g. "开发编程". */
  domain: string;
  /** One-line justification the generator gave for the domain. */
  reason?: string;
  /** The skill's anthropomorphic "job persona", written for fun. */
  persona?: {
    tool?: string;
    role?: string;
    scene?: string;
  };
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
  /**
   * Classification and persona metadata from skills-profiles, merged in by
   * the registry worker. Absent for skills the dataset has not profiled
   * (and whenever that source is unreachable) — the skill still works.
   */
  profile?: SkillProfile;
}

/**
 * The full per-skill profile, assembled from the five angle files the
 * profiles dataset ships per skill (skills/<id>/<angle>.json) on demand
 * when the detail drawer's 画像 tab opens. `domain` and `persona` are not
 * re-fetched — they already ride along on the index entry (`Skill.profile`)
 * and the dataset guarantees the files never contradict the index.
 *
 * Every angle is optional: one file being unreachable hides its section
 * without breaking the others.
 */
export interface SkillProfileDetail {
  /** One ≤100-character pitch built around the user's pain point. */
  scenario?: string;
  /** Three ≤20-character slogans. */
  taglines?: string[];
  /** Outside view: what you hand it → what you get back. */
  blackbox?: {
    function: string;
    inputOutput: Array<{ input: string; output: string }>;
  };
  /** Inside view: the happy path plus the key mechanisms behind it. */
  whitebox?: { executionFlow: string[]; mechanisms: string[] };
  /** First-person user notes, categorized 妙用/坑/注意/启发. */
  comments?: Array<{ user: string; category: string; comment: string }>;
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
