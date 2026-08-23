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
  getLinkStatus,
  linkAgents,
  listInstalledSkills,
  removeSkills,
  unlinkAgents,
  updateSkills,
  type AgentLinkResult,
  type AgentStatus,
  type InstalledSkill,
} from "./skills-manager";
import {
  getMockAgentStatus,
  getMockInstalledSkills,
  removeMockSkill,
  setMockAgentLinked,
} from "./mock-local";

/** All skills installed into the global skills directory. */
export async function fetchInstalledSkills(): Promise<InstalledSkill[]> {
  if (isTauri()) {
    return listInstalledSkills({ global: true });
  }
  return getMockInstalledSkills();
}

/** Remove an installed skill (backend in Tauri, mock store in the browser). */
export async function removeInstalledSkill(name: string): Promise<void> {
  if (isTauri()) {
    await removeSkills([name], { global: true });
    return;
  }
  removeMockSkill(name);
}

/** Re-install a skill from its recorded source (no-op in the mock store). */
export async function updateInstalledSkill(name: string): Promise<void> {
  if (isTauri()) {
    await updateSkills([name], { scope: "global" });
    return;
  }
  // Locally-sourced skills cannot be re-installed; nothing to do in the mock.
  void name;
}

/** Per-agent link status for the global skills directory. */
export async function fetchAgentStatus(): Promise<AgentStatus[]> {
  if (isTauri()) {
    return getLinkStatus({ global: true });
  }
  return getMockAgentStatus();
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
