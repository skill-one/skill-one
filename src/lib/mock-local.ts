/**
 * Mutable in-memory stand-ins for the `agents-skills` backend, used when the
 * app runs in a plain browser (dev server / tests) where the Tauri commands are
 * unavailable. Mutations below mirror what the Rust library would do, so the
 * UI behaves the same either way.
 */

import type { AgentStatus, InstalledSkill } from "./skills-manager";

// ---------------------------------------------------------------- skills

const mockSkillRows = [
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

function buildMockSkills(): InstalledSkill[] {
  return mockSkillRows.map((row, i) => ({
    name: row.name,
    path: `~/.agents/skills/${row.name}`,
    scope: "global",
    agents: i === 0 ? ["claude-code"] : [],
    source: row.source,
    sourceUrl: null,
    sourceType: row.sourceType,
  }));
}

let mockSkills = buildMockSkills();

export function getMockInstalledSkills(): InstalledSkill[] {
  return mockSkills;
}

export function removeMockSkill(name: string): void {
  mockSkills = mockSkills.filter((s) => s.name !== name);
}

export function resetMockInstalledSkills(): void {
  mockSkills = buildMockSkills();
}

// ---------------------------------------------------------------- agents
// Kept in the same order (and using the same agent names) as the
// `agents-skills` library's built-in agent table, so the browser mock
// mirrors the order the backend returns in a Tauri build.

const mockAgentRows = [
  {
    name: "claude-code",
    display: "Claude Code",
    linked: true,
    canonical: false,
  },
  { name: "cursor", display: "Cursor", linked: false, canonical: false },
  { name: "gemini-cli", display: "Gemini CLI", linked: false, canonical: false },
  { name: "windsurf", display: "Windsurf", linked: false, canonical: true },
];

function buildMockAgentStatus(): AgentStatus[] {
  return mockAgentRows.map((a) => ({
    name: a.name,
    display: a.display,
    linked: a.linked,
    canonical: a.canonical,
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
