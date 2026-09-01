/**
 * Data access for locally installed skills and agent link status.
 *
 * Skills are managed in the user-level **global** directory only; project-level
 * support has been removed. Agent link status only applies to the global
 * directory as well (linking agents to a project's canonical dir is out of
 * scope).
 *
 * Inside the Tauri shell these delegate to the `agents-skills` backend
 * commands; in a plain browser (dev server / tests) they fall back to the
 * mutable mock store so the UI stays explorable without the native side.
 */

import { isTauri } from "./tauri";
import { toDetail } from "./skill-detail-api";
import type { SkillDetail } from "../types/skill";
import {
  disableSkills,
  enableSkills,
  getLinkStatus,
  installSkill,
  linkAgents,
  listInstalledSkills,
  readSkillMd,
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

/** Simulated clone duration for browser mock installs, in milliseconds. */
export const MOCK_INSTALL_DELAY_MS = 1200;

/** All skills installed into the global skills directory. */
export async function fetchInstalledSkills(): Promise<InstalledSkill[]> {
  if (isTauri()) {
    return listInstalledSkills();
  }
  return getMockInstalledSkills();
}

/**
 * SKILL.md of an installed skill, read from the local skills directory.
 *
 * Used by the detail view whenever the registry cannot point at the skill's
 * repo path (local skills, or store-sourced ones whose index entry is not
 * available) — disk works offline, covers disabled skills and shows the
 * version actually installed. In Tauri the backend resolves the name through
 * its `list` and returns the raw text, parsed here with the same frontmatter
 * parser the store detail view uses. In the browser the mock store provides
 * an equivalent record.
 */
export async function fetchLocalSkillDetail(name: string): Promise<SkillDetail> {
  if (isTauri()) {
    const { path, content } = await readSkillMd(name);
    return toDetail(content, name, path);
  }
  const skill = getMockInstalledSkills().find((s) => s.name === name);
  if (!skill) {
    throw new Error(`本地未安装技能 ${name}`);
  }
  const description = skill.description ?? "";
  return {
    name: skill.name,
    description,
    instructions: `演示数据：${skill.name} 的本地 SKILL.md 正文。\n\n（浏览器演示数据：模拟的本地 SKILL.md）`,
    path: `${skill.path}/SKILL.md`,
  };
}

/**
 * Install a single skill from its source GitHub repo (`owner/repo`) into the
 * global skills directory. Only the named skill is installed, never the entire
 * repo.
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
    const result = await installSkill(repo, { skills: [name] });
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
  installMockSkill(repo, name);
}

/** Remove an installed skill from the global skills directory. */
export async function removeInstalledSkill(name: string): Promise<void> {
  if (isTauri()) {
    await removeSkills([name]);
    return;
  }
  removeMockSkill(name);
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
  return getLinkStatus();
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
    const result = await linkAgents(names, { migrate: true });
    return result.results;
  }
  names.forEach((name) => setMockAgentLinked(name, true));
  return names.flatMap((name) => mockLinkResult(name, "linked"));
}

/** Unlink one agent's skills dir (backend in Tauri, mock store in the browser). */
export async function unlinkAgent(name: string): Promise<AgentLinkResult[]> {
  if (isTauri()) {
    const result = await unlinkAgents([name]);
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

/** Enable or disable an installed skill (Tauri backend / mock store). */
export async function setSkillEnabled(
  name: string,
  enabled: boolean,
): Promise<void> {
  if (isTauri()) {
    if (enabled) {
      await enableSkills([name]);
    } else {
      await disableSkills([name]);
    }
    return;
  }
  setMockSkillEnabled(name, enabled);
}
