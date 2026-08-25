/**
 * Data access for locally installed skills and agent link status.
 *
 * Project-scoped installs/config are currently out of scope: every operation
 * targets the user-level (global) skills directory. Inside the Tauri shell
 * these delegate to the `agents-skills` backend commands; in a plain browser
 * (dev server / tests) they fall back to the mutable mock store so the UI
 * stays explorable without the native side.
 */

import { isTauri } from "./tauri";
import {
  disableSkills,
  enableSkills,
  getLinkStatus,
  installSkill,
  linkAgents,
  listInstalledSkills,
  removeSkills,
  unlinkAgents,
  type AgentLinkResult,
  type AgentStatus,
  type InstalledSkill,
} from "./skills-manager";
import {
  getMockAgentStatus,
  getMockInstalledSkills,
  installMockSkill,
  removeMockSkill,
  setMockAgentLinked,
  setMockSkillEnabled,
} from "./mock-local";

/** All skills installed into the global skills directory. */
export async function fetchInstalledSkills(): Promise<InstalledSkill[]> {
  if (isTauri()) {
    return listInstalledSkills({ global: true });
  }
  return getMockInstalledSkills();
}

/**
 * Install a single skill from its source GitHub repo (`owner/repo`). Only the
 * named skill is installed, never the entire repo.
 *
 * In Tauri the `owner/repo` source is handed straight to the backend, which
 * uses agents-skills' GitHub install (clones the repo, pulling the skill's
 * supporting files along) rather than downloading a single SKILL.md. The
 * backend reports the outcome via `installed`/`failed` — an Ok response alone
 * does not mean anything was installed (the name may fail to match, or the
 * clone/install can fail), so failures are surfaced here instead of being
 * silently swallowed. In the browser this records the install in the mock
 * store instead.
 */
export async function installSkillFromSource(
  repo: string,
  name: string,
): Promise<void> {
  if (isTauri()) {
    const result = await installSkill(repo, { global: true, skills: [name] });
    if (result.failed.length > 0) {
      const f = result.failed[0];
      throw new Error(f.error || `安装失败：${f.skill}`);
    }
    if (result.installed.length === 0) {
      throw new Error(`未在 ${repo} 中找到可安装的技能 ${name}`);
    }
    return;
  }
  installMockSkill(repo, name);
}

/** Remove an installed skill (backend in Tauri, mock store in the browser). */
export async function removeInstalledSkill(name: string): Promise<void> {
  if (isTauri()) {
    await removeSkills([name], { global: true });
    return;
  }
  removeMockSkill(name);
}

/**
 * Per-agent link status for the global skills directory.
 *
 * The backend scans each unlinked agent's own skills directory and reports any
 * skills found as `internalSkills`, so the UI can preview them and offer
 * "迁移并链接" instead of a bare "链接".
 */
export async function fetchAgentStatus(): Promise<AgentStatus[]> {
  if (!isTauri()) {
    return getMockAgentStatus();
  }
  return getLinkStatus({ global: true });
}

/**
 * Link one agent's skills dir (backend in Tauri, mock store in the browser).
 *
 * With `migrate`, existing skills inside the agent's own directory are moved
 * into the canonical dir instead of the link being refused. Callers should only
 * pass it after the user confirmed the migration.
 */
export async function linkAgent(
  name: string,
  options: { migrate?: boolean } = {},
): Promise<AgentLinkResult[]> {
  if (isTauri()) {
    const result = await linkAgents([name], {
      global: true,
      migrate: options.migrate,
    });
    return result.results;
  }
  setMockAgentLinked(name, true);
  return [
    {
      agent: name,
      display: mockDisplayOf(name),
      status: "linked",
      moved: [],
      skipped: [],
      skills: [],
      message: null,
    },
  ];
}

/** Unlink one agent's skills dir (backend in Tauri, mock store in the browser). */
export async function unlinkAgent(name: string): Promise<AgentLinkResult[]> {
  if (isTauri()) {
    const result = await unlinkAgents([name], { global: true });
    return result.results;
  }
  setMockAgentLinked(name, false);
  return [
    {
      agent: name,
      display: mockDisplayOf(name),
      status: "unlinked",
      moved: [],
      skipped: [],
      skills: [],
      message: null,
    },
  ];
}

function mockDisplayOf(name: string): string {
  return getMockAgentStatus().find((a) => a.name === name)?.display ?? name;
}

// ---------------------------------------------------------------- enable/disable
// Enablement is a real backend state: the agents-skills library moves a
// skill's directory between the canonical dir and `disabled-skills`, which is
// exactly what `list` reports back via `InstalledSkill.enabled`. The UI has no
// separate client-side preference.

/** Enable or disable an installed skill (backend in Tauri, mock store in the browser). */
export async function setSkillEnabled(
  name: string,
  enabled: boolean,
): Promise<void> {
  if (isTauri()) {
    if (enabled) {
      await enableSkills([name], { global: true });
    } else {
      await disableSkills([name], { global: true });
    }
    return;
  }
  setMockSkillEnabled(name, enabled);
}
