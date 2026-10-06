/**
 * Mutable in-memory stand-ins for the `agents-skills` backend, used when the
 * app runs in a plain browser (dev server / tests) where the Tauri commands are
 * unavailable. Mutations below mirror what the Rust library would do, so the
 * UI behaves the same either way.
 */

import type { AgentStatus, InstalledSkill } from "./skills-manager";

// ---------------------------------------------------------------- skills

/**
 * A skill's on-disk directory (global dir keeps a `~` prefix for readability).
 *
 * The mock's `InstalledSkill` records carry no `path` — the backend DTO
 * passes only the facts the UI reads — so this is only what the mock's own
 * SKILL.md reader needs to address a skill's directory.
 */
export function mockPathFor(name: string): string {
  return `~/.agents/skills/${name}`;
}

/**
 * Ages spread across every relative-time bucket (刚刚 / 3天前 / … / 1年前), so
 * the browser demo exercises the whole ladder. Ages are offsets rather than
 * fixed epochs: a pinned timestamp would drift into reading "3年前" for every
 * row over time instead of showing the spread.
 */
const isTestEnv =
  import.meta.env.MODE === "test" || Boolean(import.meta.env.VITEST);

interface MockSkillRow {
  name: string;
  description: string;
  installedDaysAgo: number;
  displayName?: string;
  enabled?: boolean;
}

const mockTestRows: MockSkillRow[] = [
  {
    name: "pdf",
    description: "PDF 文档读取、生成、合并、拆分与标注。",
    installedDaysAgo: 0,
  },
  {
    name: "docx",
    description: "以编程方式创建和编辑 Word 文档。",
    installedDaysAgo: 3,
  },
  {
    name: "pptx",
    description: "创建包含布局、演讲者备注和图表的演示文稿。",
    installedDaysAgo: 12,
  },
  {
    name: "mcp-builder",
    description: "脚手架 MCP 服务器，支持工具、资源和提示词。",
    installedDaysAgo: 45,
  },
  {
    name: "code-review",
    // The one row whose frontmatter `name` folds differently than its slug,
    // so the browser demo exercises the display-spelling fallback too.
    displayName: "Code Review",
    description: "运行结构化代码审查，包含严重级别和建议。",
    installedDaysAgo: 200,
  },
  {
    name: "frontend-design",
    description: "使用 React + Tailwind 构建可访问的响应式 UI。",
    installedDaysAgo: 400,
  },
];

const mockBrowserPreviewRows: MockSkillRow[] = [
  ...mockTestRows,
  {
    name: "react-query-helper",
    displayName: "React Query Helper",
    description: "React Query 状态流转与服务端缓存管理辅助工具。",
    installedDaysAgo: 5,
  },
  {
    name: "git-commit",
    description: "智能 Git Conventional Commit 提交信息生成与检查工具。",
    installedDaysAgo: 8,
  },
  {
    name: "dingtalk-doc",
    description: "钉钉文档读取、Markdown 解析与富文本导出工具。",
    installedDaysAgo: 20,
  },
  {
    name: "微信读书助手",
    displayName: "微信读书助手",
    description: "导出微信读书笔记、划线标注并同步到本地 Markdown。",
    installedDaysAgo: 60,
  },
  {
    name: "🤖-auto-agent",
    displayName: "🤖-auto-agent",
    description: "本地自动化 Agent 脚本执行器与任务链调度引擎。",
    installedDaysAgo: 90,
  },
  {
    name: "legacy-data-cleaner",
    displayName: "Legacy Data Cleaner",
    description: "旧版数据迁移与临时脏数据清洗脚本（已停用）。",
    installedDaysAgo: 150,
    enabled: false,
  },
];

/** Unix seconds `days` ago, standing in for a directory's creation time. */
function mockInstalledAt(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
}

/** One mock skill record with the derived facts `list` reports since 0.26. */
function mockSkill(
  name: string,
  description: string,
  installedAt: number | null,
  displayName?: string,
  enabled = true,
): InstalledSkill {
  return {
    name,
    // The backend's list always reports the frontmatter spelling; a row with
    // no distinct one folds to the slug.
    displayName: displayName ?? name,
    description,
    enabled,
    installedAt,
  };
}

function buildMockSkills(): InstalledSkill[] {
  const rows = isTestEnv ? mockTestRows : mockBrowserPreviewRows;
  return rows.map((row) =>
    mockSkill(
      row.name,
      row.description,
      mockInstalledAt(row.installedDaysAgo),
      row.displayName,
      row.enabled ?? true,
    ),
  );
}

let mockSkills = buildMockSkills();

/**
 * Raw SKILL.md text the browser mock keeps per skill, standing in for the file
 * on disk. Populated lazily by `getMockSkillMd` (a synthetic document) and
 * overwritten by `setMockSkillMd` when the editor saves. The real file side is
 * the backend's `read_skill_md` / `write_skill_md`.
 */
const mockRawMd = new Map<string, string>();

/** All mock skills in the global skills directory. */
export function getMockInstalledSkills(): InstalledSkill[] {
  return mockSkills;
}

/** Set total mock skills count for browser testing / demo. */
export function setMockSkillsCount(count: number): void {
  if (count <= 0) {
    mockSkills = [];
    return;
  }
  const base = buildMockSkills();
  if (count <= base.length) {
    mockSkills = base.slice(0, count);
    return;
  }
  const extra: InstalledSkill[] = [];
  for (let i = base.length; i < count; i++) {
    const num = i + 1;
    extra.push(
      mockSkill(
        `skill-${num}`,
        `Skill ${num} 模拟能力描述。`,
        mockInstalledAt(Math.floor(i / 2)),
        `Skill ${num}`,
        true,
      ),
    );
  }
  mockSkills = [...base, ...extra];
}

/** Remove a skill by name. */
export function removeMockSkill(name: string): void {
  mockSkills = mockSkills.filter((s) => s.name !== name);
  mockRawMd.delete(name);
}

/**
 * Record a mock install of a single skill. Mirrors an install in the browser
 * without cloning a repo; a skill of the same name is left untouched (since
 * agents-skills 0.17 `add` never overwrites). No source is kept — agents-skills
 * 0.13 records none either — and the description is empty because the mock has
 * no SKILL.md to read it from.
 *
 * @returns `true` when a same-named skill already existed (the install's
 * "skipped" outcome), `false` when a skill was added.
 */
export function installMockSkill(name: string): boolean {
  if (mockSkills.some((s) => s.name === name)) return true;
  // A freshly installed directory: the creation time is the install time.
  mockSkills = [mockSkill(name, "", Date.now() / 1000), ...mockSkills];
  return false;
}

/**
 * Record a mock install of a skill that does carry a description, standing in
 * for a real SKILL.md the mock cannot read.
 */
export function addMockLocalSkill(name: string): void {
  if (mockSkills.some((s) => s.name === name)) return;
  mockSkills = [
    mockSkill(name, "本地 skill 的描述。", Date.now() / 1000),
    ...mockSkills,
  ];
}

/** Flip a mock skill's enabled state, mirroring the backend's disable/enable. */
export function setMockSkillEnabled(name: string, enabled: boolean): void {
  mockSkills = mockSkills.map((s) => (s.name === name ? { ...s, enabled } : s));
}

/**
 * Overwrite a mock skill's install time (Unix seconds), standing in for the
 * birth time a real directory carries — or `null` for a filesystem that
 * records none.
 */
export function setMockSkillInstalledAt(
  name: string,
  installedAt: number | null,
): void {
  mockSkills = mockSkills.map((s) =>
    s.name === name ? { ...s, installedAt } : s,
  );
}

/**
 * The raw SKILL.md text of a mock skill — what the editor loads. Returns the
 * saved override when one exists, otherwise synthesizes a minimal document
 * (frontmatter + a body) so a never-edited skill still opens for editing.
 */
export function getMockSkillMd(name: string): string {
  const saved = mockRawMd.get(name);
  if (saved != null) return saved;
  const description = mockSkills.find((s) => s.name === name)?.description ?? "";
  return [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# ${name}`,
    "",
    `演示数据：${name} 的本地 SKILL.md 正文。`,
    "",
    "（浏览器演示数据：模拟的本地 SKILL.md）",
    "",
  ].join("\n");
}

/** Record an edited SKILL.md so the mock reads it back (in-memory only). */
export function setMockSkillMd(name: string, content: string): void {
  mockRawMd.set(name, content);
}

export function resetMockInstalledSkills(): void {
  mockSkills = buildMockSkills();
  mockRawMd.clear();
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
  },
  {
    name: "cursor",
    display: "Cursor",
    linked: false,
    canonical: false,
    // Carries skills and non-skill files in its own dir → the menu row shows
    // the pending counts a link would adopt / quarantine.
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
  }));
}

let mockAgentStatus = buildMockAgentStatus();

export function getMockAgentStatus(): AgentStatus[] {
  return mockAgentStatus;
}

/**
 * Mock link: adopt the agent's private content into the mock canonical dir.
 *
 * Mirrors the library's one-way link — skills move in unless the canonical dir
 * already holds that name (the existing copy wins), and non-skill entries are
 * quarantined. Returns what the backend would report in its `linked` outcome.
 */
export function linkMockAgent(name: string): {
  adopted: string[];
  quarantined: string[];
  conflicts: string[];
} {
  const agent = mockAgentStatus.find((a) => a.name === name);
  const skills = agent?.internalSkills ?? [];
  const quarantined = agent?.internalOthers ?? [];
  const conflicts = skills.filter((s) => mockSkills.some((m) => m.name === s));
  const adopted = skills.filter((s) => !conflicts.includes(s));
  for (const skill of adopted) installMockSkill(skill);
  mockAgentStatus = mockAgentStatus.map((a) =>
    a.name === name
      ? { ...a, linked: true, internalSkills: [], internalOthers: [] }
      : a,
  );
  return { adopted, quarantined, conflicts };
}

/** Mock unlink: break the link. Nothing is restored — adopted content stays. */
export function unlinkMockAgent(name: string): void {
  mockAgentStatus = mockAgentStatus.map((a) =>
    a.name === name ? { ...a, linked: false } : a,
  );
}

export function resetMockAgentStatus(): void {
  mockAgentStatus = buildMockAgentStatus();
}
