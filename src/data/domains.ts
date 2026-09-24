import {
  Brain,
  ChartPie,
  CircleHelp,
  Code,
  Coffee,
  CreditCard,
  FileText,
  FlaskConical,
  GraduationCap,
  type LucideIcon,
  Megaphone,
  Palette,
  PenLine,
  Shapes,
  ShieldCheck,
} from "lucide-react";

import type { AppLocale } from "../lib/i18n-content";

/**
 * The profiles dataset's fixed domain taxonomy. The dataset publishes domain
 * *keys* — the English enum its generator prompts with (`development`,
 * `data-analysis`, …) — so this map is keyed by those and carries the label
 * (English and Chinese) and monochrome icon the app shows instead.
 *
 * Every mark is a lucide line icon drawn in `currentColor`: no emoji, no colour
 * of its own. A row of skills then keeps its names as the loudest thing on it,
 * and an owner avatar stays the strongest picture on a repository card instead
 * of competing with a row of colourful glyphs.
 *
 * A key missing here (a future rename upstream) simply renders as its raw key
 * without an icon, and the tooltip falls back to that label.
 *
 * A skill's classification has three states, and the taxonomy keeps two of them
 * apart on purpose:
 *
 * - **A domain** — the dataset placed the skill, and the label says where.
 * - **`other`** (Other / 其他, `Shapes`) — the dataset placed it *nowhere*: an
 *   answer, "none of the above fit", which is why it wears a jumble of mixed
 *   shapes rather than a question.
 * - **Nothing at all** ({@link UNCLASSIFIED_DOMAIN}, Unclassified / 未分类,
 *   `CircleHelp`) — nobody classified it: a local install the store has never
 *   seen, an index that does not list it, or a key this build does not know.
 *   That one is a question, so it wears one, and it is deliberately *not* part
 *   of `DOMAINS`: the upstream enum has no such value, and nothing may file a
 *   skill there.
 */

/** One user-facing text in both shipped languages. */
export interface LocalizedText {
  en: string;
  zh: string;
}

export interface DomainMeta {
  /** The upstream enum value, e.g. "development". */
  key: string;
  /** The label shown in the UI, per locale. */
  name: LocalizedText;
  /** The monochrome glyph shown next to the label; renders in currentColor. */
  icon: LucideIcon;
  /** The hover-tip text, per locale. */
  description: LocalizedText;
}

export const DOMAINS: DomainMeta[] = [
  {
    key: "development",
    name: { en: "Development", zh: "开发编程" },
    icon: Code,
    description: {
      en: "Coding, debugging, refactoring, databases, API/framework integration, web scraping and browser automation",
      zh: "写代码、调试、重构、数据库、API/框架集成、爬虫与浏览器自动化",
    },
  },
  {
    key: "testing",
    name: { en: "Testing & Quality", zh: "测试与质量" },
    icon: FlaskConical,
    description: {
      en: "Test writing and test frameworks, E2E/UI automation tests, code review, quality checks and debugging tools",
      zh: "测试编写与测试框架、E2E/UI 自动化测试、代码审查、质量检查与 bug 排查工具",
    },
  },
  {
    key: "data-analysis",
    name: { en: "Data Analysis", zh: "数据分析" },
    icon: ChartPie,
    description: {
      en: "SQL queries, data cleaning, statistical analysis, visualization, reporting and data engineering (ETL)",
      zh: "SQL 查询、数据清洗、统计分析、可视化、报表与数据工程(ETL)",
    },
  },
  {
    key: "devops-security",
    name: { en: "DevOps & Security", zh: "运维与安全" },
    icon: ShieldCheck,
    description: {
      en: "Deployment and releases, cloud infrastructure, monitoring and alerting, SRE, networking and security protection",
      zh: "部署发布、云基础设施、监控告警、SRE、网络配置与安全防护",
    },
  },
  {
    key: "office-productivity",
    name: { en: "Office Productivity", zh: "办公效率" },
    icon: FileText,
    description: {
      en: "docx/pdf/xlsx/ppt document processing, email, calendars, meeting notes, task and project management",
      zh: "docx/pdf/xlsx/ppt 等文档处理、邮件、日历、会议纪要、任务与项目管理",
    },
  },
  {
    key: "content-creation",
    name: { en: "Content Creation", zh: "内容创作" },
    icon: PenLine,
    description: {
      en: "Writing, copywriting, translation, technical documentation, social media, podcasts/scripts — creation centered on text and information",
      zh: "文章写作、文案、翻译、技术文档、社媒内容、播客/脚本等, 以文字与信息为主体的创作",
    },
  },
  {
    key: "design-media",
    name: { en: "Design & Media", zh: "设计多媒体" },
    icon: Palette,
    description: {
      en: "UI/graphic design, image generation and editing, video editing, 3D, brand identity — visual and audio-video production",
      zh: "UI/平面设计、图像生成与编辑、视频剪辑、3D、品牌视觉等视觉与音视频制作",
    },
  },
  {
    key: "knowledge-management",
    name: { en: "Knowledge Management", zh: "知识管理" },
    icon: Brain,
    description: {
      en: "Notes and knowledge bases (Obsidian/Notion, etc.), information retrieval, investigation and deep research, knowledge organization",
      zh: "笔记与知识库(Obsidian/Notion 等)、信息检索、调研与深度研究、资料整理沉淀",
    },
  },
  {
    key: "business-ops",
    name: { en: "Business Operations", zh: "商业运营" },
    icon: Megaphone,
    description: {
      en: "Marketing, SEO, sales, customer service, e-commerce, growth and CRM — work aimed at business growth",
      zh: "市场营销、SEO、销售、客服、电商、增长与 CRM 等面向业务增长与客户的工作",
    },
  },
  {
    key: "finance-payment",
    name: { en: "Finance & Payments", zh: "支付金融" },
    icon: CreditCard,
    description: {
      en: "Payment integration, billing and invoicing, finance and wealth management, trading skills",
      zh: "支付集成、账单与发票、金融理财、交易类技能",
    },
  },
  {
    key: "education",
    name: { en: "Education", zh: "教育学习" },
    icon: GraduationCap,
    description: {
      en: "Teaching and lesson preparation, course creation, tutoring, practice problems and interview preparation",
      zh: "教学备课、课程制作、学习辅导、刷题与面试准备",
    },
  },
  {
    key: "lifestyle",
    name: { en: "Lifestyle", zh: "生活服务" },
    icon: Coffee,
    description: {
      en: "Travel planning, food, fitness and health, personal daily affairs",
      zh: "旅行规划、饮食、健身健康、个人日常事务",
    },
  },
  {
    key: "other",
    name: { en: "Other", zh: "其他" },
    // A jumble of shapes, not a question mark: the dataset *did* classify
    // these, and its answer was "none of the above fit". The question mark
    // belongs to the skills nothing classified at all.
    icon: Shapes,
    description: {
      en: "Nothing above fits well, or it spans several domains and cannot be filed under a single one",
      zh: "以上分类都不贴合, 或横跨多个领域而无法归入单一分类",
    },
  },
];

/**
 * The key for the third state: a skill no classification covers at all. Not an
 * upstream value — the facets report it for a skill with no `profile.domain`,
 * and {@link domainMeta} resolves it so every surface can name and mark it the
 * same way.
 */
export const UNCLASSIFIED_DOMAIN = "unclassified";

/** See {@link UNCLASSIFIED_DOMAIN}; outside `DOMAINS`, resolvable all the same. */
const UNCLASSIFIED: DomainMeta = {
  key: UNCLASSIFIED_DOMAIN,
  name: { en: "Unclassified", zh: "未分类" },
  icon: CircleHelp,
  description: {
    en: "No classification: not listed in the store, or an unknown upstream key",
    zh: "没有分类信息: 商店未收录, 或上游的分类键本版不认识",
  },
};

const ALL_DOMAINS = [...DOMAINS, UNCLASSIFIED];

const BY_KEY = new Map(ALL_DOMAINS.map((domain) => [domain.key, domain]));
// A group header may carry a localized label while a profile carries the key;
// index both languages so either resolves.
const BY_NAME = new Map(
  ALL_DOMAINS.flatMap((domain) => [
    [domain.name.en, domain],
    [domain.name.zh, domain],
  ]),
);

/**
 * The metadata for one domain, looked up by its upstream key or by its
 * display label (in either language) — a group header carries the label while
 * a skill's profile carries the key, and both need the icon. Also answers for
 * {@link UNCLASSIFIED_DOMAIN}, so the state with no upstream key still has a
 * label, a mark and a tip. Undefined when unknown.
 */
export function domainMeta(nameOrKey: string): DomainMeta | undefined {
  return BY_KEY.get(nameOrKey) ?? BY_NAME.get(nameOrKey);
}

/** The display label for a domain key in a locale; the raw key when stale. */
export function domainLabel(key: string, locale: AppLocale): string {
  return BY_KEY.get(key)?.name[locale] ?? key;
}

/**
 * The mark a skill wears in a list's glyph slot: its leading domain's icon, or
 * the help icon when nothing classified it — an empty list, or a key this
 * build does not know. The one resolver the row and the card both call, so a
 * skill is marked the same wherever it is listed; a slot with nothing to say is
 * still a slot that lines up.
 */
export function domainIcon(domain?: readonly string[]): LucideIcon {
  const key = domain?.[0];
  return (key ? domainMeta(key)?.icon : undefined) ?? UNCLASSIFIED.icon;
}

/**
 * The hover text for a skill's classification: the leading domain's scope
 * description — or its label, for a key outside the taxonomy — plus the other
 * domains the skill belongs to. The glyph the tip hangs off already names the
 * domain, so the text carries no duplicated mark. `domain` is best fit first;
 * empty (a skill nothing classified) reads as Unclassified, and so does an
 * unknown key, which is the same state one upstream rename later.
 */
export function domainTooltip(
  domain: readonly string[],
  locale: AppLocale,
): string {
  const key = domain[0] ?? UNCLASSIFIED_DOMAIN;
  const meta = domainMeta(key) ?? UNCLASSIFIED;
  const others = domain.slice(1).map((other) => domainLabel(other, locale));
  if (others.length === 0) return meta.description[locale];
  return locale === "zh"
    ? `${meta.description.zh}（同时属于：${others.join("、")}）`
    : `${meta.description.en} (also: ${others.join(", ")})`;
}
