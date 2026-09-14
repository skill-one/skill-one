/**
 * Mutable in-memory stand-ins for the `agents-skills` backend, used when the
 * app runs in a plain browser (dev server / tests) where the Tauri commands are
 * unavailable. Mutations below mirror what the Rust library would do, so the
 * UI behaves the same either way.
 */

import type { AgentStatus, InstalledSkill } from "./skills-manager";

// ---------------------------------------------------------------- skills

/** A skill's on-disk path (global dir keeps a `~` prefix for readability). */
function mockPathFor(name: string): string {
  return `~/.agents/skills/${name}`;
}

const mockGlobalRows = [
  {
    name: "pdf",
    description: "PDF 文档读取、生成、合并、拆分与标注。",
  },
  {
    name: "docx",
    description: "以编程方式创建和编辑 Word 文档。",
  },
  {
    name: "pptx",
    description: "创建包含布局、演讲者备注和图表的演示文稿。",
  },
  {
    name: "mcp-builder",
    description: "脚手架 MCP 服务器，支持工具、资源和提示词。",
  },
  {
    name: "code-review",
    description: "运行结构化代码审查，包含严重级别和建议。",
  },
  {
    name: "frontend-design",
    description: "使用 React + Tailwind 构建可访问的响应式 UI。",
  },
];

function buildMockSkills(): InstalledSkill[] {
  return mockGlobalRows.map((row) => ({
    name: row.name,
    path: mockPathFor(row.name),
    description: row.description,
    enabled: true,
  }));
}

let mockSkills = buildMockSkills();

/** All mock skills in the global skills directory. */
export function getMockInstalledSkills(): InstalledSkill[] {
  return mockSkills;
}

/** Remove a skill by name. */
export function removeMockSkill(name: string): void {
  mockSkills = mockSkills.filter((s) => s.name !== name);
}

/**
 * Record a mock install of a single skill. Mirrors a successful install in
 * the browser without cloning a repo; a skill of the same name is left
 * untouched. No source is kept — agents-skills 0.13 records none either.
 */
export function installMockSkill(name: string): void {
  if (mockSkills.some((s) => s.name === name)) return;
  mockSkills = [
    {
      name,
      path: mockPathFor(name),
      enabled: true,
    },
    ...mockSkills,
  ];
}

/**
 * Record a mock install of a skill with no description, mirroring a skill
 * whose SKILL.md frontmatter carries none.
 */
export function addMockLocalSkill(name: string): void {
  if (mockSkills.some((s) => s.name === name)) return;
  mockSkills = [
    {
      name,
      path: mockPathFor(name),
      description: "本地 skill 的描述。",
      enabled: true,
    },
    ...mockSkills,
  ];
}

/** Flip a mock skill's enabled state, mirroring the backend's disable/enable. */
export function setMockSkillEnabled(name: string, enabled: boolean): void {
  mockSkills = mockSkills.map((s) => (s.name === name ? { ...s, enabled } : s));
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
    // Carries skills and non-skill files in its own dir → the menu row shows
    // the pending counts a link would adopt / park.
    internalSkills: ["pdf", "docx"],
    internalOthers: ["README.md"],
  },
  {
    name: "gemini-cli",
    display: "Gemini CLI",
    linked: false,
    canonical: false,
    // Empty dir → linking moves nothing.
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
