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
  installSkill,
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
  installMockSkill,
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

/**
 * Install a single skill from its source GitHub repo (`owner/repo`). Only the
 * named skill is installed, never the entire repo.
 *
 * In Tauri the `owner/repo` source is handed straight to the backend, which
 * uses agents-skills' GitHub install (clones the repo, pulling the skill's
 * supporting files along) rather than downloading a single SKILL.md. In the
 * browser this records the install in the mock store instead.
 */
export async function installSkillFromSource(
  repo: string,
  name: string,
): Promise<void> {
  if (isTauri()) {
    await installSkill(repo, { global: true, skills: [name] });
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

/** Re-install a skill from its recorded source (no-op in the mock store). */
export async function updateInstalledSkill(name: string): Promise<void> {
  if (isTauri()) {
    await updateSkills([name], { scope: "global" });
    return;
  }
  // Locally-sourced skills cannot be re-installed; nothing to do in the mock.
  void name;
}

/**
 * Per-agent link status for the global skills directory.
 *
 * In Tauri this additionally runs a one-time pre-link probe: for each unlinked,
 * non-canonical agent it attempts a plain link. A refusal means the agent's own
 * directory already holds skills, which we surface as `status.skills` so the UI
 * can preview them and offer "迁移并链接" instead of a bare "链接".
 *
 * A side effect of that probe is that an *empty* agent dir gets linked. We undo
 * it immediately (the agent is reverted to its unlinked state) so the card shows
 * the true status and "取消链接" keeps working. Agents that genuinely carry
 * skills are never linked by the probe (the link is refused), so their skills
 * are preserved.
 */
export async function fetchAgentStatus(): Promise<AgentStatus[]> {
  if (!isTauri()) {
    return getMockAgentStatus();
  }
  const statuses = await getLinkStatus({ global: true });
  const enriched = await Promise.all(
    statuses.map(async (status) => {
      if (status.linked || status.canonical) return status;
      try {
        const res = await linkAgents([status.name], { global: true });
        const r = res.results[0];
        if (!r) return status;
        if (r.status === "refused") {
          // Agent dir holds skills; the link was refused, so nothing changed.
          return { ...status, linked: false, skills: r.skills };
        }
        if (r.status === "linked") {
          // The probe linked an empty-dir agent as a side effect: undo it so the
          // card reflects the real unlinked state and 取消链接 stays effective.
          try {
            await unlinkAgents([status.name], { global: true });
            return { ...status, linked: false, skills: [] };
          } catch {
            // Could not revert: report the actual linked state.
            return { ...status, linked: true, skills: [] };
          }
        }
        // alreadyLinked / skipped: nothing changed, no skills to surface.
        return { ...status, linked: false, skills: [] };
      } catch {
        return status;
      }
    }),
  );
  return enriched;
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
