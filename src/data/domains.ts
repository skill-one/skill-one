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

/**
 * The profiles dataset's fixed domain taxonomy. The dataset publishes domain
 * *keys* — the English enum its generator prompts with (`development`,
 * `data-analysis`, …) — so this map is keyed by those and carries the Chinese
 * label and monochrome icon the app shows instead.
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
 * - **`other`** (其他, `Shapes`) — the dataset placed it *nowhere*: an
 *   answer, "none of the above fit", which is why it wears a jumble of mixed
 *   shapes rather than a question.
 * - **Nothing at all** ({@link UNCLASSIFIED_DOMAIN}, 未分类, `CircleHelp`) —
 *   nobody classified it: a local install the store has never seen, an index
 *   that does not list it, or a key this build does not know. That one is a
 *   question, so it wears one, and it is deliberately *not* part of `DOMAINS`:
 *   the upstream enum has no such value, and nothing may file a skill there.
 */

export interface DomainMeta {
  /** The upstream enum value, e.g. "development". */
  key: string;
  /** The label shown in the UI. */
  name: string;
  /** The monochrome glyph shown next to the label; renders in currentColor. */
  icon: LucideIcon;
  description: string;
}

export const DOMAINS: DomainMeta[] = [
  {
    key: "development",
    name: "开发编程",
    icon: Code,
    description:
      "写代码、调试、重构、数据库、API/框架集成、爬虫与浏览器自动化",
  },
  {
    key: "testing",
    name: "测试与质量",
    icon: FlaskConical,
    description:
      "测试编写与测试框架、E2E/UI 自动化测试、代码审查、质量检查与 bug 排查工具",
  },
  {
    key: "data-analysis",
    name: "数据分析",
    icon: ChartPie,
    description: "SQL 查询、数据清洗、统计分析、可视化、报表与数据工程(ETL)",
  },
  {
    key: "devops-security",
    name: "运维与安全",
    icon: ShieldCheck,
    description: "部署发布、云基础设施、监控告警、SRE、网络配置与安全防护",
  },
  {
    key: "office-productivity",
    name: "办公效率",
    icon: FileText,
    description:
      "docx/pdf/xlsx/ppt 等文档处理、邮件、日历、会议纪要、任务与项目管理",
  },
  {
    key: "content-creation",
    name: "内容创作",
    icon: PenLine,
    description:
      "文章写作、文案、翻译、技术文档、社媒内容、播客/脚本等, 以文字与信息为主体的创作",
  },
  {
    key: "design-media",
    name: "设计多媒体",
    icon: Palette,
    description:
      "UI/平面设计、图像生成与编辑、视频剪辑、3D、品牌视觉等视觉与音视频制作",
  },
  {
    key: "knowledge-management",
    name: "知识管理",
    icon: Brain,
    description:
      "笔记与知识库(Obsidian/Notion 等)、信息检索、调研与深度研究、资料整理沉淀",
  },
  {
    key: "business-ops",
    name: "商业运营",
    icon: Megaphone,
    description:
      "市场营销、SEO、销售、客服、电商、增长与 CRM 等面向业务增长与客户的工作",
  },
  {
    key: "finance-payment",
    name: "支付金融",
    icon: CreditCard,
    description: "支付集成、账单与发票、金融理财、交易类技能",
  },
  {
    key: "education",
    name: "教育学习",
    icon: GraduationCap,
    description: "教学备课、课程制作、学习辅导、刷题与面试准备",
  },
  {
    key: "lifestyle",
    name: "生活服务",
    icon: Coffee,
    description: "旅行规划、饮食、健身健康、个人日常事务",
  },
  {
    key: "other",
    name: "其他",
    // A jumble of shapes, not a question mark: the dataset *did* classify
    // these, and its answer was "none of the above fit". The question mark
    // belongs to the skills nothing classified at all.
    icon: Shapes,
    description: "以上分类都不贴合, 或横跨多个领域而无法归入单一分类",
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
  name: "未分类",
  icon: CircleHelp,
  description: "没有分类信息: 商店未收录, 或上游的分类键本版不认识",
};

const BY_KEY = new Map(
  [...DOMAINS, UNCLASSIFIED].map((domain) => [domain.key, domain]),
);
const BY_NAME = new Map(
  [...DOMAINS, UNCLASSIFIED].map((domain) => [domain.name, domain]),
);

/**
 * The metadata for one domain, looked up by its upstream key or by its
 * display label — a group header carries the label while a skill's profile
 * carries the key, and both need the icon. Also answers for
 * {@link UNCLASSIFIED_DOMAIN}, so the state with no upstream key still has a
 * label, a mark and a tip. Undefined when unknown.
 */
export function domainMeta(nameOrKey: string): DomainMeta | undefined {
  return BY_KEY.get(nameOrKey) ?? BY_NAME.get(nameOrKey);
}

/** The display label for a domain key; the raw key when the taxonomy is stale. */
export function domainLabel(key: string): string {
  return BY_KEY.get(key)?.name ?? key;
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
 * empty (a skill nothing classified) reads as 未分类, and so does an unknown
 * key, which is the same state one upstream rename later.
 */
export function domainTooltip(domain: readonly string[]): string {
  const key = domain[0] ?? UNCLASSIFIED_DOMAIN;
  const meta = domainMeta(key) ?? UNCLASSIFIED;
  const others = domain.slice(1).map(domainLabel);
  return others.length > 0
    ? `${meta.description}（同时属于：${others.join("、")}）`
    : meta.description;
}
