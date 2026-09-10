/**
 * The profiles dataset's fixed domain taxonomy: 13 categories, each with an
 * emoji and a one-line scope description. Mirrors the prompt-side enum in
 * skill-one/skills-profiles — the dataset's `domain.domain` field is
 * guaranteed to be one of these names, so the map is keyed by it.
 *
 * A domain missing here (a future rename upstream) simply renders without
 * an emoji and falls back to the per-skill reason in the tooltip.
 */

export interface DomainMeta {
  name: string;
  emoji: string;
  description: string;
}

export const DOMAINS: DomainMeta[] = [
  {
    name: "开发编程",
    emoji: "💻",
    description:
      "写代码、调试、重构、数据库、API/框架集成、爬虫与浏览器自动化",
  },
  {
    name: "测试与质量",
    emoji: "🧪",
    description:
      "测试编写与测试框架、E2E/UI 自动化测试、代码审查、质量检查与 bug 排查工具",
  },
  {
    name: "数据分析",
    emoji: "📊",
    description: "SQL 查询、数据清洗、统计分析、可视化、报表与数据工程(ETL)",
  },
  {
    name: "运维与安全",
    emoji: "🛡️",
    description: "部署发布、云基础设施、监控告警、SRE、网络配置与安全防护",
  },
  {
    name: "办公效率",
    emoji: "🗂️",
    description:
      "docx/pdf/xlsx/ppt 等文档处理、邮件、日历、会议纪要、任务与项目管理",
  },
  {
    name: "内容创作",
    emoji: "✍️",
    description:
      "文章写作、文案、翻译、技术文档、社媒内容、播客/脚本等, 以文字与信息为主体的创作",
  },
  {
    name: "设计多媒体",
    emoji: "🎨",
    description:
      "UI/平面设计、图像生成与编辑、视频剪辑、3D、品牌视觉等视觉与音视频制作",
  },
  {
    name: "知识管理",
    emoji: "🧠",
    description:
      "笔记与知识库(Obsidian/Notion 等)、信息检索、调研与深度研究、资料整理沉淀",
  },
  {
    name: "商业运营",
    emoji: "📈",
    description:
      "市场营销、SEO、销售、客服、电商、增长与 CRM 等面向业务增长与客户的工作",
  },
  {
    name: "支付金融",
    emoji: "💰",
    description: "支付集成、账单与发票、金融理财、交易类技能",
  },
  {
    name: "教育学习",
    emoji: "🎓",
    description: "教学备课、课程制作、学习辅导、刷题与面试准备",
  },
  {
    name: "生活服务",
    emoji: "🏠",
    description: "旅行规划、饮食、健身健康、个人日常事务",
  },
  {
    name: "其他",
    emoji: "❓",
    description: "仅当以上分类确实都不贴合时使用, 不要勉强归类",
  },
];

const BY_NAME = new Map(DOMAINS.map((domain) => [domain.name, domain]));

/** The emoji/scope metadata for one domain name; undefined when unknown. */
export function domainMeta(name: string): DomainMeta | undefined {
  return BY_NAME.get(name);
}
