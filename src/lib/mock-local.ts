/**
 * Mutable in-memory stand-ins for the `agents-skills` backend, used when the
 * app runs in a plain browser (dev server / tests) where the Tauri commands are
 * unavailable. Mutations below mirror what the Rust library would do, so the
 * UI behaves the same either way.
 */

import type { AgentStatus, InstalledSkill } from "./skills-manager";
import {
  isSameScope,
  scopeFromSkill,
  type SkillScope,
} from "./skill-scope";

// ---------------------------------------------------------------- skills

/**
 * The one mock project the browser demo uses. Exported so the projects store can
 * register it and the demo project's skills become visible in the merged list.
 */
export const MOCK_PROJECT_PATH = "/Users/me/work/demo-app";

/** A skill's on-disk path for a scope (global keeps a `~` prefix for readability). */
function mockPathFor(name: string, scope: SkillScope): string {
  return scope.kind === "global"
    ? `~/.agents/skills/${name}`
    : `${scope.path}/.agents/skills/${name}`;
}

const mockGlobalRows = [
  {
    name: "pdf",
    source: "anthropics/skills",
    sourceType: "github",
    description: "PDF 文档读取、生成、合并、拆分与标注。",
  },
  {
    name: "docx",
    source: "anthropics/skills",
    sourceType: "github",
    description: "以编程方式创建和编辑 Word 文档。",
  },
  {
    name: "pptx",
    source: "anthropics/skills",
    sourceType: "github",
    description: "创建包含布局、演讲者备注和图表的演示文稿。",
  },
  {
    name: "mcp-builder",
    source: "anthropics/skills",
    sourceType: "github",
    description: "脚手架 MCP 服务器，支持工具、资源和提示词。",
  },
  {
    name: "code-review",
    source: "obra/superpowers",
    sourceType: "github",
    description: "运行结构化代码审查，包含严重级别和建议。",
  },
  {
    name: "frontend-design",
    source: "anthropics/skills",
    sourceType: "github",
    description: "使用 React + Tailwind 构建可访问的响应式 UI。",
  },
];

// Two skills that live in the demo project rather than globally, so the merged
// list shows both scopes side by side and the project scope is explorable.
const mockProjectRows = [
  {
    name: "deploy-preview",
    source: "vercel/skills",
    sourceType: "github",
    description: "为当前分支拉起一个预览部署。",
  },
  {
    name: "local-migration",
    source: null,
    sourceType: null,
    description: "本地迁移脚本技能（无安装来源）。",
  },
];

function buildMockSkills(): InstalledSkill[] {
  const globalScope: SkillScope = { kind: "global" };
  const projectScope: SkillScope = { kind: "project", path: MOCK_PROJECT_PATH };
  const globals: InstalledSkill[] = mockGlobalRows.map((row, i) => ({
    name: row.name,
    path: mockPathFor(row.name, globalScope),
    scope: "global",
    agents: i === 0 ? ["claude-code"] : [],
    source: row.source,
    sourceUrl: null,
    sourceType: row.sourceType,
    description: row.description,
    enabled: true,
  }));
  const projects: InstalledSkill[] = mockProjectRows.map((row) => ({
    name: row.name,
    path: mockPathFor(row.name, projectScope),
    scope: "project",
    agents: [],
    source: row.source,
    sourceUrl: null,
    sourceType: row.sourceType,
    description: row.description,
    enabled: true,
  }));
  return [...globals, ...projects];
}

let mockSkills = buildMockSkills();

/** Skills installed in a given scope (global, or one project directory). */
export function getMockSkillsInScope(scope: SkillScope): InstalledSkill[] {
  return mockSkills.filter((s) => isSameScope(scopeFromSkill(s), scope));
}

/** All mock skills across every scope (kept for the popover / legacy consumers). */
export function getMockInstalledSkills(): InstalledSkill[] {
  return mockSkills;
}

/** Whether a scope already holds a skill with this name. */
function hasMockSkillInScope(name: string, scope: SkillScope): boolean {
  return getMockSkillsInScope(scope).some((s) => s.name === name);
}

/** Remove a skill from a scope (name + scope, since the same name can exist in two scopes). */
export function removeMockSkill(name: string, scope: SkillScope): void {
  mockSkills = mockSkills.filter(
    (s) => !(s.name === name && isSameScope(scopeFromSkill(s), scope)),
  );
}

/**
 * Record a mock install of a single skill from a GitHub source (`owner/repo`)
 * into a scope. Mirrors a successful install in the browser without cloning a
 * repo; a skill of that name already in the same scope is left untouched.
 */
export function installMockSkill(
  repo: string,
  name: string,
  scope: SkillScope = { kind: "global" },
): void {
  if (hasMockSkillInScope(name, scope)) return;
  mockSkills = [
    {
      name,
      path: mockPathFor(name, scope),
      scope: scope.kind === "global" ? "global" : "project",
      agents: [],
      source: repo,
      sourceUrl: null,
      sourceType: "github",
      enabled: true,
    },
    ...mockSkills,
  ];
}

/**
 * Record a mock install of a skill with no source record, mirroring a skill
 * placed manually into a skills directory (no lock entry → `sourceType` is
 * `null`). Used to exercise the "no reinstall source" migration path.
 */
export function addMockLocalSkill(
  name: string,
  scope: SkillScope = { kind: "global" },
): void {
  if (hasMockSkillInScope(name, scope)) return;
  mockSkills = [
    {
      name,
      path: mockPathFor(name, scope),
      scope: scope.kind === "global" ? "global" : "project",
      agents: [],
      source: null,
      sourceUrl: null,
      sourceType: null,
      description: "本地 skill 的描述。",
      enabled: true,
    },
    ...mockSkills,
  ];
}

/** Flip a mock skill's enabled state, mirroring the backend's disable/enable. */
export function setMockSkillEnabled(
  name: string,
  scope: SkillScope,
  enabled: boolean,
): void {
  mockSkills = mockSkills.map((s) =>
    s.name === name && isSameScope(scopeFromSkill(s), scope)
      ? { ...s, enabled }
      : s,
  );
}

/**
 * Move a mock skill from one scope to another by rewriting its scope/path, the
 * browser mirror of a reinstall (source skills) or a directory move (sourceless
 * skills). A name clash in the target scope drops the origin copy (target wins),
 * matching what the real move surfaces as a collision.
 */
export function moveMockSkill(
  name: string,
  from: SkillScope,
  to: SkillScope,
): void {
  const origin = mockSkills.find(
    (s) => s.name === name && isSameScope(scopeFromSkill(s), from),
  );
  if (!origin) return;
  const rest = mockSkills.filter(
    (s) =>
      !(s.name === name && isSameScope(scopeFromSkill(s), from)) &&
      !(s.name === name && isSameScope(scopeFromSkill(s), to)),
  );
  const relocated: InstalledSkill = {
    ...origin,
    scope: to.kind === "global" ? "global" : "project",
    path: mockPathFor(name, to),
  };
  mockSkills = [relocated, ...rest];
}

export function resetMockInstalledSkills(): void {
  mockSkills = buildMockSkills();
}

// ---------------------------------------------------------------- agents
// Kept in the same order (and using the same agent names) as the
// `agents-skills` library's built-in agent table, so the browser mock
// mirrors the order the backend returns in a Tauri build.

const mockAgentRows: Array<{
  name: string;
  display: string;
  linked: boolean;
  canonical: boolean;
  internalSkills?: string[];
  internalOthers?: string[];
  pendingBackup?: { path: string; items: string[] } | null;
}> = [
  {
    name: "claude-code",
    display: "Claude Code",
    linked: true,
    canonical: false,
    internalSkills: [],
  },
  {
    name: "codex",
    display: "Codex",
    linked: true,
    canonical: false,
    internalSkills: [],
    // Linked without importing: its original content sits in the backup slot
    // until a migrate adopts the skills or an unlink restores them.
    pendingBackup: {
      path: "/Users/me/.agents/backup-skills/codex",
      items: ["old-pdf", "notes.md"],
    },
  },
  {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    // Carries skills and non-skill files in its own dir → clicking the card
    // opens the decision dialog offering 导入并链接 / 直接链接.
    internalSkills: ["pdf", "docx"],
    internalOthers: ["README.md"],
  },
  {
    name: "gemini-cli",
    display: "Gemini CLI",
    linked: false,
    canonical: false,
    // Empty dir → clicking links directly, no preview dialog.
    internalSkills: [],
  },
  {
    name: "windsurf",
    display: "Windsurf",
    linked: false,
    canonical: true,
    internalSkills: [],
  },
];

function buildMockAgentStatus(): AgentStatus[] {
  return mockAgentRows.map((a) => ({
    name: a.name,
    display: a.display,
    linked: a.linked,
    canonical: a.canonical,
    internalSkills: a.internalSkills,
    internalOthers: a.internalOthers,
    pendingBackup: a.pendingBackup,
  }));
}

let mockAgentStatus = buildMockAgentStatus();

export function getMockAgentStatus(): AgentStatus[] {
  return mockAgentStatus;
}

export function setMockAgentLinked(name: string, linked: boolean): void {
  mockAgentStatus = mockAgentStatus.map((a) =>
    a.name === name ? { ...a, linked } : a,
  );
}

export function resetMockAgentStatus(): void {
  mockAgentStatus = buildMockAgentStatus();
}
