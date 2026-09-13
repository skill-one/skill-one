import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "./tauri";

/**
 * Thin typed client for the skills install / agent management commands, backed
 * by the `agents-skills` Rust library in the Tauri shell.
 *
 * All commands operate on the user-level **global** skills directory
 * (`~/.agents/skills`); project-level support has been removed. Since
 * agents-skills 0.13 there is no lockfile: `list`/`remove` are driven by a
 * scan of the canonical directory alone.
 */

/**
 * A listed skill, as the backend's directory scan reports it. Models the
 * subset of `list --json` the UI reads; the backend DTO may carry more.
 */
export interface InstalledSkill {
  name: string;
  path: string;
  /**
   * Whether the skill is enabled (`true`) or parked in the disabled dir
   * (`false`). Set by the backend from the on-disk state, not a UI preference.
   */
  enabled: boolean;
  /** Short human-readable description; absent when the skill has no metadata. */
  description?: string;
}

export interface InstalledSkillDto {
  name: string;
  canonicalPath: string;
}

/** A skill's SKILL.md read from the local skills directory. */
export interface SkillMd {
  /** Absolute path of the file on disk. */
  path: string;
  /** Raw content, frontmatter included; parsed on the frontend. */
  content: string;
}

export interface InstallFailureDto {
  skill: string;
  error: string;
}

export interface InstallResult {
  listOnly: boolean;
  installed: InstalledSkillDto[];
  failed: InstallFailureDto[];
  /** Every skill discovered in the source (whether installed or not). */
  discovered: string[];
}

export interface RemoveResult {
  installed: string[];
  requested: string[];
  removed: string[];
}

/** Outcome of one enable/disable pass; `changed` moved in the asked direction. */
export interface ToggleResult {
  changed: string[];
  requested: string[];
  already: string[];
  missing: string[];
  inventory: string[];
}

export type AgentLinkStatus =
  | "linked"
  | "alreadyLinked"
  | "migrated"
  | "refused"
  | "skipped"
  | "failed"
  | "unlinked"
  | "notLinked";

export interface AgentLinkResult {
  agent: string;
  display: string;
  status: AgentLinkStatus;
  /** Skills moved into the canonical dir (`migrated`). */
  moved: string[];
  /** Skills left parked because the canonical dir already has them (`migrated`). */
  skipped: string[];
  /**
   * Skills parked in the backup slot (`linked`/`migrated`): a later migrate
   * adopts them into the canonical dir, unlink restores them.
   */
  parkedSkills: string[];
  /** Non-skill entries parked in the backup slot (`linked`/`migrated`). */
  parkedOthers: string[];
  /** Backup slot dir holding the parked content (`linked`/`migrated`), if any. */
  backupDir: string | null;
  /** Entries restored from the backup slot (`unlinked`). */
  restored: string[];
  /** Backup slot dir the restored content came from (`unlinked`). */
  restoredFrom: string | null;
  /** Refusal reason or error message (`refused`/`failed`). */
  message: string | null;
}

export interface LinkResult {
  global: boolean;
  results: AgentLinkResult[];
}

/** Content parked by a previous link, waiting for unlink to restore. */
export interface PendingBackup {
  /** Backup slot dir (`.agents/backup-skills/<agent>`). */
  path: string;
  /** Names of the entries parked in the slot. */
  items: string[];
}

/** Per-agent link status (from `agent --status`). */
export interface AgentStatus {
  name: string;
  display: string;
  linked: boolean;
  canonical: boolean;
  /**
   * Skills already living inside the agent's own directory. Only populated for
   * unlinked, non-canonical agents: it surfaces what a migrate would move into
   * the canonical dir, so the UI can preview them on the row.
   */
  internalSkills?: string[];
  /**
   * Non-skill entries (files, symlinks to non-directories) inside the agent's
   * own skills dir. Same population rules as `internalSkills`; a link parks
   * them into the backup slot, a migrate never adopts them.
   */
  internalOthers?: string[];
  /**
   * Backup slot with content parked by a previous link; unlink restores it,
   * a migrate adopts the skills. Only populated for unlinked, non-canonical
   * agents.
   */
  pendingBackup?: PendingBackup | null;
}

function requireTauri(): void {
  if (!isTauri()) {
    throw new Error(
      "skills manager commands only run inside the desktop app (Tauri).",
    );
  }
}

/**
 * Install skills from a source: a git URL, GitHub `owner/repo`, local path or
 * download URL. With `listOnly`, nothing is installed — the discovery preview
 * is returned instead.
 */
export async function installSkill(
  source: string,
  options: { skills?: string[]; listOnly?: boolean } = {},
): Promise<InstallResult> {
  requireTauri();
  return invoke<InstallResult>("install_skill", {
    source,
    skills: options.skills,
    listOnly: options.listOnly,
  });
}

/** List installed skills in the global skills directory. */
export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  requireTauri();
  return invoke<InstalledSkill[]>("list_installed_skills");
}

/**
 * Read the raw SKILL.md of an installed skill from the local skills
 * directory. The backend resolves the name through its `list`, so disabled
 * (parked) skills stay readable and no path is ever interpolated.
 */
export async function readSkillMd(name: string): Promise<SkillMd> {
  requireTauri();
  return invoke<SkillMd>("read_skill_md", { name });
}

/**
 * Remove installed skills. `all` removes everything; otherwise the listed
 * `skills` are removed.
 */
export async function removeSkills(
  skills: string[],
  options: { all?: boolean } = {},
): Promise<RemoveResult> {
  requireTauri();
  return invoke<RemoveResult>("remove_skills", {
    skills,
    all: options.all,
  });
}

/** Move skills between the canonical dir and the parked disabled dir. */
export async function setSkillsEnabled(
  enabled: boolean,
  skills: string[] = [],
  options: { all?: boolean } = {},
): Promise<ToggleResult> {
  requireTauri();
  return invoke<ToggleResult>("set_skills_enabled", {
    skills,
    all: options.all,
    enabled,
  });
}

/**
 * Link (or with `unlink`, disconnect) agents' skills directories to the
 * canonical skills dir. `agents` empty = auto-detect installed agents; `"*"`
 * = all known agents.
 */
export async function linkAgents(
  agents: string[] = [],
  options: { unlink?: boolean; migrate?: boolean } = {},
): Promise<LinkResult> {
  requireTauri();
  return invoke<LinkResult>("link_agents", {
    agents,
    unlink: options.unlink,
    migrate: options.migrate,
  });
}

/** Unlink agents from the canonical skills dir. */
export function unlinkAgents(
  agents: string[] = [],
  options: Record<string, never> = {},
): Promise<LinkResult> {
  return linkAgents(agents, { ...options, unlink: true });
}

/**
 * Read the raw provenance ledger (`.skill-one.json` inside the global skills
 * directory). Returns `null` when the file does not exist yet; parsing is the
 * frontend's job (see `lib/provenance.ts`), which also owns the tolerance
 * policy for corrupt or outdated content.
 */
export async function readProvenanceRaw(): Promise<string | null> {
  requireTauri();
  return invoke<string | null>("read_provenance");
}

/** Replace the provenance ledger file with the given JSON content. */
export async function writeProvenanceRaw(content: string): Promise<void> {
  requireTauri();
  await invoke("write_provenance", { content });
}

/**
 * Compute the skills.sh upstream content hash of an installed skill's
 * directory (`lib/skill_hash.rs` on the backend). `null` when the name is
 * not installed; the frontend treats an error the same way — hashing is
 * always a best-effort signal, never a failure.
 */
export async function computeSkillHash(name: string): Promise<string | null> {
  requireTauri();
  try {
    return await invoke<string | null>("compute_skill_hash", { name });
  } catch (e) {
    console.warn(`skill hash: failed to hash ${name}`, e);
    return null;
  }
}

/** Report per-agent link status. */
export async function getLinkStatus(): Promise<AgentStatus[]> {
  requireTauri();
  return invoke<AgentStatus[]>("link_status");
}
