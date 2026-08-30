/**
 * Locally curated content for the featured page.
 *
 * The registry index carries no category metadata, so the featured page
 * builds its sections from this hand-picked list instead. Each entry
 * references a skill by repo + name; references that no longer resolve in
 * the fetched index are skipped at render time, so a stale entry can only
 * narrow the page, never break it.
 */

/** A registry skill referenced by its identity fields. */
export interface SkillRef {
  /** Source repository in "owner/repo" form. */
  repo: string;
  /** Skill name (the registry index's skillId). */
  name: string;
}

/** A curated section of the featured page. */
export interface FeaturedCategory {
  /** Stable identifier, used as the React key. */
  id: string;
  /** Section heading shown above the grid. */
  title: string;
  /** Curated skills in display order. */
  skills: SkillRef[];
}

export const FEATURED_CATEGORIES: FeaturedCategory[] = [
  {
    id: "efficiency",
    title: "提升效率",
    skills: [
      { repo: "vercel-labs/skills", name: "find-skills" },
      { repo: "mattpocock/skills", name: "handoff" },
      { repo: "mattpocock/skills", name: "teach" },
      { repo: "mattpocock/skills", name: "grill-me" },
      { repo: "anthropics/skills", name: "skill-creator" },
      { repo: "mattpocock/skills", name: "triage" },
    ],
  },
  {
    id: "design",
    title: "设计",
    skills: [
      { repo: "anthropics/skills", name: "frontend-design" },
      { repo: "vercel-labs/agent-skills", name: "web-design-guidelines" },
      { repo: "nextlevelbuilder/ui-ux-pro-max-skill", name: "ui-ux-pro-max" },
      { repo: "anthropics/skills", name: "canvas-design" },
      { repo: "anthropics/skills", name: "theme-factory" },
      { repo: "anthropics/skills", name: "brand-guidelines" },
    ],
  },
  {
    id: "development",
    title: "开发",
    skills: [
      { repo: "mattpocock/skills", name: "tdd" },
      { repo: "mattpocock/skills", name: "improve-codebase-architecture" },
      { repo: "mattpocock/skills", name: "codebase-design" },
      { repo: "mattpocock/skills", name: "code-review" },
      { repo: "anthropics/skills", name: "webapp-testing" },
      { repo: "anthropics/skills", name: "mcp-builder" },
    ],
  },
  {
    id: "writing",
    title: "写作与文档",
    skills: [
      { repo: "anthropics/skills", name: "pptx" },
      { repo: "anthropics/skills", name: "pdf" },
      { repo: "anthropics/skills", name: "docx" },
      { repo: "anthropics/skills", name: "xlsx" },
      { repo: "anthropics/skills", name: "doc-coauthoring" },
      { repo: "anthropics/skills", name: "internal-comms" },
    ],
  },
  {
    id: "automation",
    title: "自动化",
    skills: [
      { repo: "larksuite/cli", name: "lark-task" },
      { repo: "scrapegraphai/just-scrape", name: "just-scrape" },
      { repo: "microsoft/playwright-cli", name: "playwright-cli" },
      { repo: "browser-act/skills", name: "browser-act" },
      { repo: "firecrawl/cli", name: "firecrawl" },
      { repo: "browser-use/browser-use", name: "browser-use" },
    ],
  },
];
