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
 *
 * Since agents-skills 0.20 the name is the skill's on-disk directory name —
 * the identity `remove`/`disable`/`enable` use, with the `SKILL.md` frontmatter
 * `name` no longer read anywhere — and `list` carries no `path` any more
 * (resolve a directory with the library's `Manager::skill_dir` when one is
 * needed, which the app does on the backend only).
 */
export interface InstalledSkill {
  name: string;
  /**
   * Whether the skill is enabled (`true`) or parked in the disabled dir
   * (`false`). Set by the backend from the on-disk state, not a UI preference.
   */
  enabled: boolean;
  /**
   * Single-line description, straight from the on-disk `SKILL.md` frontmatter.
   * Since agents-skills 0.16 the library reports it from `list` itself — the
   * app used to parse the file.
   */
  description: string;
  /**
   * The skill directory's creation time as Unix seconds (UTC) — approximately
   * when it landed on disk. Exact for `add` installs, but a skill adopted from
   * an agent directory keeps that directory's original time. `null`/absent when
   * the platform records no creation time (some Linux filesystems).
   */
  installedAt?: number | null;
}

/** A skill's SKILL.md read from the local skills directory. */
export interface SkillMd {
  /** Absolute path of the file on disk. */
  path: string;
  /** Raw content, frontmatter included; parsed on the frontend. */
  content: string;
}

/**
 * The outcome of one install. One source resolves to exactly one skill, so
 * there is no per-skill outcome list: a failed install rejects the call, and
 * `skipped` reports the 0.17 no-overwrite rule (a skill of the same name
 * already installed — enabled or parked — is left untouched).
 */
export interface InstallResult {
  /** The installed skill's on-disk directory name. */
  skill: string;
  /** `true` when nothing was copied because the skill is already installed. */
  skipped: boolean;
}

export type AgentLinkStatus =
  | "linked"
  | "alreadyLinked"
  | "refused"
  | "skipped"
  | "failed"
  | "unlinked"
  | "notLinked";

/**
 * One agent's link/unlink result. Since agents-skills 0.15 linking is one-way:
 * the agent's own skills are adopted into the canonical dir, its non-skill
 * files are quarantined, name clashes are dropped, and `unlinked` restores
 * nothing — so no variant carries a "restored" payload any more.
 */
export interface AgentLinkResult {
  agent: string;
  display: string;
  status: AgentLinkStatus;
  /** Skills moved into the canonical dir (`linked`). */
  adopted: string[];
  /**
   * Non-skill entries moved into `.misc/<agent>/` inside the canonical dir
   * (`linked`). They stay there for good — unlink does not move them back.
   */
  quarantined: string[];
  /**
   * Entries dropped because the canonical dir (or `disabled-skills`) already
   * holds that name — the existing copy wins (`linked`).
   */
  conflicts: string[];
  /** Refusal reason or error message (`refused`/`failed`). */
  message: string | null;
}

export interface LinkResult {
  results: AgentLinkResult[];
}

/** Per-agent link status (from `agent --status`). */
export interface AgentStatus {
  name: string;
  display: string;
  linked: boolean;
  canonical: boolean;
  /**
   * Skills already living inside the agent's own directory. Only populated for
   * unlinked, non-canonical agents: it surfaces what a link would adopt into
   * the canonical dir, so the UI can preview them on the row.
   */
  internalSkills?: string[];
  /**
   * Non-skill entries (files, symlinks to non-directories) inside the agent's
   * own skills dir. Same population rules as `internalSkills`; a link
   * quarantines them into the canonical dir's `.misc/<agent>/`.
   */
  internalOthers?: string[];
}

function requireTauri(): void {
  if (!isTauri()) {
    throw new Error(
      "skills manager commands only run inside the desktop app (Tauri).",
    );
  }
}

/**
 * Install one skill from `source` — one of the two forms agents-skills 0.21
 * accepts: a local skill directory (it must directly contain a `SKILL.md`), or
 * `owner/repo@<skill>` for one skill on GitHub. The app always sends the
 * GitHub form; the store's skill name is the directory name the source matches
 * on. A failed install rejects; see `InstallResult` for the success shape.
 */
export async function installSkill(source: string): Promise<InstallResult> {
  requireTauri();
  return invoke<InstallResult>("install_skill", { source });
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
 * Overwrite an installed skill's SKILL.md with `content` (frontmatter
 * included — the editor edits the raw file). The backend resolves the name
 * through its `list`, so no path is ever interpolated, and writes atomically
 * so an interrupted save never leaves a half file.
 */
export async function writeSkillMd(
  name: string,
  content: string,
): Promise<void> {
  requireTauri();
  await invoke("write_skill_md", { name, content });
}

/**
 * Open an installed skill's directory in the system file manager. The backend
 * resolves the name through its `list` and does the opening itself, so no
 * path is ever interpolated from the frontend, disabled (parked) skills stay
 * reachable, and the webview needs no general "open any path" permission.
 */
export async function openSkillDir(name: string): Promise<void> {
  requireTauri();
  await invoke("open_skill_dir", { name });
}

/** Remove installed skills; resolves with the names that actually went. */
export async function removeSkills(skills: string[]): Promise<string[]> {
  requireTauri();
  return invoke<string[]>("remove_skills", { skills });
}

/**
 * Move skills between the canonical dir and the parked disabled dir; resolves
 * with the names that moved.
 */
export async function setSkillsEnabled(
  enabled: boolean,
  skills: string[],
): Promise<string[]> {
  requireTauri();
  return invoke<string[]>("set_skills_enabled", { skills, enabled });
}

/**
 * Link agents' skills directories to the canonical skills dir. `agents` empty
 * = auto-detect installed agents; `"*"` = all known agents.
 */
export async function linkAgents(agents: string[]): Promise<LinkResult> {
  requireTauri();
  return invoke<LinkResult>("link_agents", { agents });
}

/** Unlink agents from the canonical skills dir. */
export async function unlinkAgents(agents: string[]): Promise<LinkResult> {
  requireTauri();
  return invoke<LinkResult>("link_agents", { agents, unlink: true });
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
