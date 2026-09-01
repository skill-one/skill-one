/**
 * Data access for locally installed skills and agent link status.
 *
 * Every skill operation takes a `SkillScope` — either the user-level **global**
 * directory or a specific **project** directory — so project-scoped installs,
 * removals, toggles, and cross-scope moves are all supported here. Agent link
 * status, however, still only applies to the global directory (linking agents to
 * a project's canonical dir is out of scope for now).
 *
 * Inside the Tauri shell these delegate to the `agents-skills` backend commands
 * (mapped from a scope to the `{ global, cwd }` pair); in a plain browser (dev
 * server / tests) they fall back to the mutable mock store so the UI stays
 * explorable without the native side.
 */

import { isTauri } from "./tauri";
import {
  disableSkills,
  enableSkills,
  getLinkStatus,
  installSkill,
  linkAgents,
  listInstalledSkills,
  moveSkillDir,
  removeSkills,
  unlinkAgents,
  type AgentLinkResult,
  type AgentStatus,
  type InstalledSkill,
} from "./skills-manager";
import {
  getMockAgentStatus,
  getMockSkillsInScope,
  installMockSkill,
  moveMockSkill,
  removeMockSkill,
  setMockAgentLinked,
  setMockSkillEnabled,
} from "./mock-local";
import {
  GLOBAL_SCOPE,
  isSameScope,
  scopeFromSkill,
  toBackendArgs,
  type SkillScope,
} from "./skill-scope";

/** Simulated clone duration for browser mock installs, in milliseconds. */
export const MOCK_INSTALL_DELAY_MS = 1200;

/** Skills installed into a scope (global, or one project directory). */
export async function fetchSkillsInScope(
  scope: SkillScope,
): Promise<InstalledSkill[]> {
  if (isTauri()) {
    const { global, cwd } = toBackendArgs(scope);
    return listInstalledSkills({ global, cwd });
  }
  return getMockSkillsInScope(scope);
}

/** All skills installed into the global skills directory. */
export async function fetchInstalledSkills(): Promise<InstalledSkill[]> {
  if (isTauri()) {
    return listInstalledSkills({ global: true });
  }
  return getMockSkillsInScope(GLOBAL_SCOPE);
}

/**
 * Install a single skill from its source GitHub repo (`owner/repo`) into a scope
 * (default: global). Only the named skill is installed, never the entire repo.
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
  scope: SkillScope = GLOBAL_SCOPE,
): Promise<void> {
  if (isTauri()) {
    const { global, cwd } = toBackendArgs(scope);
    const result = await installSkill(repo, { global, cwd, skills: [name] });
    if (result.failed.length > 0) {
      const f = result.failed[0];
      throw new Error(f.error || `安装失败：${f.skill}`);
    }
    if (result.installed.length === 0) {
      throw new Error(`未在 ${repo} 中找到可安装的技能 ${name}`);
    }
    return;
  }
  // Simulate a realistic clone duration so the installing state is observable
  // in the browser demo; the real Tauri install clones over the network.
  await new Promise((resolve) => setTimeout(resolve, MOCK_INSTALL_DELAY_MS));
  installMockSkill(repo, name, scope);
}

/** Remove an installed skill from a scope (default: global). */
export async function removeInstalledSkill(
  name: string,
  scope: SkillScope = GLOBAL_SCOPE,
): Promise<void> {
  if (isTauri()) {
    const { global, cwd } = toBackendArgs(scope);
    await removeSkills([name], { global, cwd });
    return;
  }
  removeMockSkill(name, scope);
}

/**
 * Move an installed skill from its current scope to `to`, i.e. what the card's
 * scope menu triggers. Two strategies, chosen by whether the skill has an
 * install source:
 *
 *  - **Source known** (a store / GitHub skill): reinstall from its `source` into
 *    the target scope, then remove the original copy. Doing the install first
 *    means a failed reinstall leaves the skill exactly where it was.
 *  - **No source** (a skill placed manually into a skills dir): nothing can be
 *    reinstalled, so the backend moves the directory itself (`move_skill`).
 *
 * A no-op when already in `to`. Failures (missing source, name clash in the
 * target, backend errors) throw with a user-facing message.
 */
export async function moveSkill(
  skill: InstalledSkill,
  to: SkillScope,
): Promise<void> {
  const from = scopeFromSkill(skill);
  if (isSameScope(from, to)) return;

  if (!isTauri()) {
    if (to.kind === "project" && getMockSkillsInScope(to).some((s) => s.name === skill.name)) {
      throw new Error("目标项目已存在同名技能");
    }
    moveMockSkill(skill.name, from, to);
    return;
  }

  if (skill.source) {
    const toArgs = toBackendArgs(to);
    const result = await installSkill(skill.source, {
      ...toArgs,
      skills: [skill.name],
    });
    if (result.failed.length > 0) {
      throw new Error(result.failed[0].error || `迁移失败：${skill.name}`);
    }
    if (result.installed.length === 0) {
      throw new Error(`未在 ${skill.source} 中找到可安装的技能 ${skill.name}`);
    }
    const fromArgs = toBackendArgs(from);
    await removeSkills([skill.name], fromArgs);
    return;
  }

  // Source-less skill: relocate the directory on disk.
  const toArgs = toBackendArgs(to);
  await moveSkillDir(skill.path, {
    toGlobal: toArgs.global,
    toCwd: toArgs.cwd,
  });
}

/**
 * Per-agent link status for the global skills directory.
 *
 * For each unlinked agent the backend classifies the contents of its own
 * skills directory (`internalSkills` / `internalOthers`) and reports any
 * backup slot parked by a previous link (`pendingBackup`), so the UI can
 * preview them and offer 导入并链接 / 直接链接 instead of a bare 链接.
 */
export async function fetchAgentStatus(): Promise<AgentStatus[]> {
  if (!isTauri()) {
    return getMockAgentStatus();
  }
  return getLinkStatus({ global: true });
}

/** Mock-store stand-in result for linking/unlinking one agent. */
function mockLinkResult(
  name: string,
  status: "linked" | "unlinked",
): AgentLinkResult[] {
  return [
    {
      agent: name,
      display: mockDisplayOf(name),
      status,
      moved: [],
      skipped: [],
      parkedSkills: [],
      parkedOthers: [],
      backupDir: null,
      restored: [],
      restoredFrom: null,
      message: null,
    },
  ];
}

/**
 * Link one agent's skills dir (backend in Tauri, mock store in the browser).
 *
 * Pre-existing content is never destroyed: without `migrate` everything parks
 * into the agent's backup slot; with `migrate` the skills move into the
 * canonical dir first (name clashes keep the canonical copy) and only the
 * non-skill entries park. Rerunning with `migrate` on an already linked agent
 * adopts skills parked by an earlier link.
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
  return mockLinkResult(name, "linked");
}

/**
 * Link several agents in one go (一键链接). Reuses the backend's batch link
 * with `migrate`, mirroring the single-agent confirm flow: each agent's skills
 * move into the canonical dir, other files park into its backup slot. Reruns
 * are safe — already linked agents come back as `alreadyLinked` and are left
 * untouched.
 */
export async function linkAllAgents(
  names: string[],
): Promise<AgentLinkResult[]> {
  if (names.length === 0) return [];
  if (isTauri()) {
    const result = await linkAgents(names, { global: true, migrate: true });
    return result.results;
  }
  names.forEach((name) => setMockAgentLinked(name, true));
  return names.flatMap((name) => mockLinkResult(name, "linked"));
}

/** Unlink one agent's skills dir (backend in Tauri, mock store in the browser). */
export async function unlinkAgent(name: string): Promise<AgentLinkResult[]> {
  if (isTauri()) {
    const result = await unlinkAgents([name], { global: true });
    return result.results;
  }
  setMockAgentLinked(name, false);
  return mockLinkResult(name, "unlinked");
}

function mockDisplayOf(name: string): string {
  return getMockAgentStatus().find((a) => a.name === name)?.display ?? name;
}

// ---------------------------------------------------------------- enable/disable
// Enablement is a real backend state: the agents-skills library moves a
// skill's directory between the canonical dir and `disabled-skills`, which is
// exactly what `list` reports back via `InstalledSkill.enabled`. The UI has no
// separate client-side preference.

/** Enable or disable an installed skill in a scope (Tauri backend / mock store). */
export async function setSkillEnabled(
  name: string,
  enabled: boolean,
  scope: SkillScope = GLOBAL_SCOPE,
): Promise<void> {
  if (isTauri()) {
    const { global, cwd } = toBackendArgs(scope);
    if (enabled) {
      await enableSkills([name], { global, cwd });
    } else {
      await disableSkills([name], { global, cwd });
    }
    return;
  }
  setMockSkillEnabled(name, scope, enabled);
}
