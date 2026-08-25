import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "./tauri";

/**
 * Thin typed client for the skills install / agent management commands, backed
 * by the `agents-skills` Rust library in the Tauri shell.
 *
 * All commands accept an optional `cwd`: the project directory to operate on
 * (empty = the app's current working directory). Skills install into
 * `.agents/skills` under that directory, and its lockfile drives list/update.
 */

/** A listed skill, enriched with lock metadata (mirrors `list --json`). */
export interface InstalledSkill {
  name: string;
  path: string;
  scope: "project" | "global";
  agents: string[];
  source: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
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

export interface DisableResult {
  installed: string[];
  requested: string[];
  disabled: string[];
  already: string[];
  missing: string[];
}

export interface EnableResult {
  disabled: string[];
  requested: string[];
  enabled: string[];
  already: string[];
  missing: string[];
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
  moved: string[];
  skipped: string[];
  skills: string[];
  message: string | null;
}

export interface LinkResult {
  global: boolean;
  results: AgentLinkResult[];
}

/** Per-agent link status (from `link --status`). */
export interface AgentStatus {
  name: string;
  display: string;
  linked: boolean;
  canonical: boolean;
  /**
   * Skills already living inside the agent's own directory. Only populated for
   * unlinked, non-canonical agents: it surfaces what a `link --migrate` would
   * move into the canonical dir, so the UI can preview them on the card.
   */
  internalSkills?: string[];
  /**
   * Non-directory entries (strays) inside the agent's own skills dir that a
   * migrate cannot move. Only populated for unlinked, non-canonical agents.
   */
  internalFiles?: string[];
  /** Absolute path to the agent's own skills dir; absent when unknown. */
  dirPath?: string | null;
}

interface ManagerOptions {
  /** Project directory to operate on; empty = the app's cwd. */
  cwd?: string;
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
  options: {
    global?: boolean;
    skills?: string[];
    listOnly?: boolean;
    fullDepth?: boolean;
  } & ManagerOptions = {},
): Promise<InstallResult> {
  requireTauri();
  return invoke<InstallResult>("install_skill", {
    source,
    global: options.global,
    skills: options.skills,
    listOnly: options.listOnly,
    fullDepth: options.fullDepth,
    cwd: options.cwd,
  });
}

/** List installed skills (project scope by default). */
export async function listInstalledSkills(
  options: {
    global?: boolean;
    agents?: string[];
  } & ManagerOptions = {},
): Promise<InstalledSkill[]> {
  requireTauri();
  return invoke<InstalledSkill[]>("list_installed_skills", {
    global: options.global,
    agents: options.agents,
    cwd: options.cwd,
  });
}

/**
 * Remove installed skills. `all` removes everything in the scope; otherwise the
 * listed `skills` are removed.
 */
export async function removeSkills(
  skills: string[],
  options: {
    global?: boolean;
    all?: boolean;
  } & ManagerOptions = {},
): Promise<RemoveResult> {
  requireTauri();
  return invoke<RemoveResult>("remove_skills", {
    skills,
    global: options.global,
    all: options.all,
    cwd: options.cwd,
  });
}

/** Disable installed skills (moves them out of the canonical dir). */
export async function disableSkills(
  skills: string[] = [],
  options: {
    global?: boolean;
    all?: boolean;
  } & ManagerOptions = {},
): Promise<DisableResult> {
  requireTauri();
  return invoke<DisableResult>("disable_skills", {
    skills,
    global: options.global,
    all: options.all,
    cwd: options.cwd,
  });
}

/** Enable disabled skills (moves them back into the canonical dir). */
export async function enableSkills(
  skills: string[] = [],
  options: {
    global?: boolean;
    all?: boolean;
  } & ManagerOptions = {},
): Promise<EnableResult> {
  requireTauri();
  return invoke<EnableResult>("enable_skills", {
    skills,
    global: options.global,
    all: options.all,
    cwd: options.cwd,
  });
}

/**
 * Link (or with `unlink`, disconnect) agents' skills directories to the
 * canonical skills dir. `agents` empty = auto-detect installed agents; `"*"`
 * = all known agents.
 */
export async function linkAgents(
  agents: string[] = [],
  options: {
    global?: boolean;
    unlink?: boolean;
    migrate?: boolean;
  } & ManagerOptions = {},
): Promise<LinkResult> {
  requireTauri();
  return invoke<LinkResult>("link_agents", {
    agents,
    global: options.global,
    unlink: options.unlink,
    migrate: options.migrate,
    cwd: options.cwd,
  });
}

/** Unlink agents from the canonical skills dir. */
export function unlinkAgents(
  agents: string[] = [],
  options: {
    global?: boolean;
  } & ManagerOptions = {},
): Promise<LinkResult> {
  return linkAgents(agents, { ...options, unlink: true });
}

/** Report per-agent link status. */
export async function getLinkStatus(
  options: {
    global?: boolean;
  } & ManagerOptions = {},
): Promise<AgentStatus[]> {
  requireTauri();
  return invoke<AgentStatus[]>("link_status", {
    global: options.global,
    cwd: options.cwd,
  });
}

/**
 * Remove stray non-skill files from an agent's skills dir (the one-click
 * delete in the stray-files dialog). The backend only deletes plain files
 * directly inside `dir`; anything outside it is rejected. Returns the names
 * that were actually removed.
 */
export async function removeStrayFiles(
  dir: string,
  files: string[],
): Promise<string[]> {
  requireTauri();
  return invoke<string[]>("remove_stray_files", { dir, files });
}
