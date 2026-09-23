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
  getLinkStatus,
  installSkill,
  linkAgents,
  listInstalledSkills,
  readSkillMd,
  removeSkills,
  setSkillsEnabled,
  unlinkAgents,
  type AgentLinkResult,
  type AgentStatus,
  type InstalledSkill,
} from "./skills-manager";
import {
  getMockAgentStatus,
  getMockInstalledSkills,
  installMockSkill,
  linkMockAgent,
  mockPathFor,
  removeMockSkill,
  setMockSkillEnabled,
  unlinkMockAgent,
} from "./mock-local";
import {
  recordSkillProvenance,
  removeSkillProvenance,
} from "./provenance";

/** Simulated download duration for browser mock installs, in milliseconds. */
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
  const description = skill.description;
  return {
    name: skill.name,
    description,
    instructions: `演示数据：${skill.name} 的本地 SKILL.md 正文。\n\n（浏览器演示数据：模拟的本地 SKILL.md）`,
    path: `${mockPathFor(skill.name)}/SKILL.md`,
  };
}

/**
 * Install a single skill from its source GitHub repo (`owner/repo`) into the
 * global skills directory. Only the named skill is installed, never the entire
 * repo.
 *
 * In Tauri the source handed to the backend is `owner/repo@<skill>`: since
 * agents-skills 0.21 the source carries the skill, and it is resolved through
 * the GitHub API, which downloads only the matched skill directory rather than
 * cloning the repo (the store's skill name is the directory name the source
 * matches on). One source resolves to exactly one skill, so a failure is this
 * call's rejection and there is no outcome list to inspect — the store's Ok
 * response does mean the skill is installed, and a same-named skill already on
 * disk comes back as `skipped` (0.17's no-overwrite rule), which is a no-op,
 * not a failure. In the browser this records the install in the mock store
 * instead.
 *
 * `options.rev` is the store entry's content hash at install time (from the
 * registry index). It is recorded in the provenance ledger as the version
 * marker a future update check compares against the latest rev — rev changed
 * means the store published a new version. The hash is deliberately NOT
 * computed from the freshly installed directory: the clone tracks repo HEAD,
 * which can be ahead of the indexed snapshot, so a computed value would
 * permanently disagree with the rev and poison the update signal. Computing
 * is reserved for the hash auto-link tier, where there is no rev to read.
 */
export async function installSkillFromSource(
  repo: string,
  name: string,
  options: { rev?: string } = {},
): Promise<void> {
  if (isTauri()) {
    // The source carries the skill (`owner/repo@<skill>`), and a failure is
    // this call's rejection — the backend has no outcome list to inspect. An
    // install that comes back `skipped` is the no-overwrite no-op, and it is
    // already the state the caller is driving the button to.
    await installSkill(`${repo}@${name}`);
  } else {
    // Simulate a realistic download duration so the installing state is
    // observable in the browser demo; the real Tauri install fetches the skill
    // directory from GitHub.
    await new Promise((resolve) => setTimeout(resolve, MOCK_INSTALL_DELAY_MS));
    installMockSkill(name);
  }
  // Record the install source in the app's provenance ledger — the only
  // store↔install association that survives (agents-skills keeps no install
  // metadata). Best-effort: it never fails the install itself.
  await recordSkillProvenance(repo, name, options.rev);
}

/** Remove an installed skill from the global skills directory. */
export async function removeInstalledSkill(name: string): Promise<void> {
  if (isTauri()) {
    await removeSkills([name]);
    await removeSkillProvenance(name);
    return;
  }
  removeMockSkill(name);
  await removeSkillProvenance(name);
}

/**
 * Per-agent link status for the global skills directory.
 *
 * For each unlinked agent the backend classifies the contents of its own
 * skills directory (`internalSkills` / `internalOthers`), so the UI can preview
 * what a link would adopt into the canonical dir and what it would quarantine.
 * Since agents-skills 0.15 there is no backup slot to report.
 */
export async function fetchAgentStatus(): Promise<AgentStatus[]> {
  if (!isTauri()) {
    return getMockAgentStatus();
  }
  return getLinkStatus();
}

/** What a mock link adopted / quarantined / dropped. */
interface MockLinkOutcome {
  adopted: string[];
  quarantined: string[];
  conflicts: string[];
}

const NO_MOCK_OUTCOME: MockLinkOutcome = {
  adopted: [],
  quarantined: [],
  conflicts: [],
};

/** Mock-store stand-in result for linking/unlinking one agent. */
function mockLinkResult(
  name: string,
  status: "linked" | "unlinked",
  outcome: MockLinkOutcome = NO_MOCK_OUTCOME,
): AgentLinkResult[] {
  return [
    {
      agent: name,
      display: mockDisplayOf(name),
      status,
      adopted: outcome.adopted,
      quarantined: outcome.quarantined,
      conflicts: outcome.conflicts,
      message: null,
    },
  ];
}

/**
 * Link one agent's skills dir (backend in Tauri, mock store in the browser).
 *
 * Linking is one-way since agents-skills 0.15: the agent's own skills are
 * adopted into the canonical dir (a name clash keeps the canonical copy) and
 * its non-skill files are quarantined into `.misc/<agent>/`. Unlink only breaks
 * the symlink — nothing moves back; adopted skills are managed by
 * `remove`/`disable` from then on.
 */
export async function linkAgent(name: string): Promise<AgentLinkResult[]> {
  if (isTauri()) {
    const result = await linkAgents([name]);
    return result.results;
  }
  return mockLinkResult(name, "linked", linkMockAgent(name));
}

/**
 * Link several agents in one go. Same one-way adoption as `linkAgent`, applied
 * to a batch; reruns are safe — already linked agents come back as
 * `alreadyLinked` and are left untouched. This is the auto-link pass's entry
 * point (`useAutoLinkAgents`).
 */
export async function linkAllAgents(
  names: string[],
): Promise<AgentLinkResult[]> {
  if (names.length === 0) return [];
  if (isTauri()) {
    const result = await linkAgents(names);
    return result.results;
  }
  return names.flatMap((name) =>
    mockLinkResult(name, "linked", linkMockAgent(name)),
  );
}

/** Unlink one agent's skills dir (backend in Tauri, mock store in the browser). */
export async function unlinkAgent(name: string): Promise<AgentLinkResult[]> {
  if (isTauri()) {
    const result = await unlinkAgents([name]);
    return result.results;
  }
  unlinkMockAgent(name);
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
    await setSkillsEnabled(enabled, [name]);
    return;
  }
  setMockSkillEnabled(name, enabled);
}
