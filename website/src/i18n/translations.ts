export interface TranslationStrings {
  nav: {
    features: string;
    howItWorks: string;
    agents: string;
    faq: string;
    download: string;
    github: string;
    switchLang: string;
    switchLangUrl: string;
    langName: string;
  };
  hero: {
    badge: string;
    titleStart: string;
    titleHighlight: string;
    subtitle: string;
    downloadMac: string;
    downloadSub: string;
    viewGithub: string;
    trustLocal: string;
    trustZeroDisk: string;
    trustAgents: string;
    interactivePrompt: string;
    broadcasting: string;
    inSync: string;
  };
  hub: {
    title: string;
    tagline: string;
    skillsLabel: string;
    coverageLabel: string;
    activeSkills: string;
    clickToBroadcast: string;
    guarantee: string;
    statusLinked: string;
    statusActive: string;
  };
  problem: {
    eyebrow: string;
    title: string;
    subtitle: string;
    withoutTitle: string;
    withoutDesc: string;
    withTitle: string;
    withDesc: string;
    pains: {
      duplication: { title: string; desc: string };
      drift: { title: string; desc: string };
      overhead: { title: string; desc: string };
    };
    gains: {
      singleSource: { title: string; desc: string };
      instantSync: { title: string; desc: string };
      zeroWaste: { title: string; desc: string };
    };
  };
  features: {
    eyebrow: string;
    title: string;
    subtitle: string;
    bento: {
      symlink: {
        title: string;
        desc: string;
        stat: string;
        statLabel: string;
      };
      autoDetect: {
        title: string;
        desc: string;
        stat: string;
        statLabel: string;
      };
      market: {
        title: string;
        desc: string;
        stat: string;
        statLabel: string;
      };
      isolation: {
        title: string;
        desc: string;
        stat: string;
        statLabel: string;
      };
      privacy: {
        title: string;
        desc: string;
        stat: string;
        statLabel: string;
      };
    };
  };
  howItWorks: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: {
      step1: { num: string; title: string; desc: string };
      step2: { num: string; title: string; desc: string };
      step3: { num: string; title: string; desc: string };
    };
  };
  agentsExplorer: {
    eyebrow: string;
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    filterAll: string;
    filterTop: string;
    filterIde: string;
    filterCli: string;
    filterDesktop: string;
    emptyResult: string;
    skillsPath: string;
    openWebsite: string;
  };
  download: {
    eyebrow: string;
    title: string;
    subtitle: string;
    macArm: string;
    macIntel: string;
    windows: string;
    linux: string;
    releaseNotes: string;
    systemReq: string;
    openSourceBadge: string;
  };
  faq: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Array<{ q: string; a: string }>;
  };
  footer: {
    tagline: string;
    rights: string;
    links: {
      github: string;
      releases: string;
      docs: string;
      license: string;
    };
  };
}

export const translations: Record<'en' | 'zh', TranslationStrings> = {
  en: {
    nav: {
      features: "Features",
      howItWorks: "How It Works",
      agents: "Ecosystem (80+)",
      faq: "FAQ",
      download: "Download",
      github: "GitHub",
      switchLang: "中文",
      switchLangUrl: "/zh/",
      langName: "English",
    },
    hero: {
      badge: "Built for the Agentic Coding Era",
      titleStart: "Install Once.",
      titleHighlight: "Ready for Every AI Agent.",
      subtitle: "The single source of truth for Agent Skills. Stop duplicating skill files across Cursor, Claude Desktop, Windsurf, Cline, and Roo Code. One install automatically symlinks to all your coding assistants with zero disk redundancy.",
      downloadMac: "Download for macOS",
      downloadSub: "Universal DMG · Apple Silicon & Intel",
      viewGithub: "View on GitHub",
      trustLocal: "100% Local-First & Private",
      trustZeroDisk: "Zero Disk Duplication",
      trustAgents: "80+ Agents Auto-Detected",
      interactivePrompt: "Click any skill or agent toggle in the live graph below to test instant broadcast synchronization:",
      broadcasting: "Broadcasting to all agents...",
      inSync: "In Sync across all active agents",
    },
    hub: {
      title: "Skill One Hub",
      tagline: "Central Dispatcher & Symlink Mesh",
      skillsLabel: "Skills Active",
      coverageLabel: "Agents Ready",
      activeSkills: "Active Domains",
      clickToBroadcast: "Click any skill below to simulate live ecosystem sync",
      guarantee: "Atomic Symlinks · Zero Redundancy · Instant Hot Reload",
      statusLinked: "Linked",
      statusActive: "Active",
    },
    problem: {
      eyebrow: "The Fragmentation Dilemma",
      title: "The Problem With Multi-Agent Workflows",
      subtitle: "Every AI assistant invents its own directory structure. Managing your agent skills shouldn't feel like manual file plumbing.",
      withoutTitle: "Without Skill One",
      withoutDesc: "Painful manual maintenance across disconnected silos",
      withTitle: "With Skill One",
      withDesc: "Centralized hub with instant symlinked propagation",
      pains: {
        duplication: {
          title: "Endless Directory Copying",
          desc: "You copy the same skill into ~/.cursor, ~/.claude, ~/.windsurf, and ~/.cline. 10 skills across 5 tools means 50 duplicate directories.",
        },
        drift: {
          title: "Version Drift & Breakage",
          desc: "You fix a bug or add a prompt rule in Cursor, but forget to update Claude. Agents behave inconsistently across your day.",
        },
        overhead: {
          title: "Broken Symlinks & Clutter",
          desc: "Writing custom shell scripts to symlink directories inevitably breaks with OS updates and tool upgrades.",
        },
      },
      gains: {
        singleSource: {
          title: "Single Source of Truth",
          desc: "One central skill repository (~/.agents/skills). All agents read the exact same authentic configuration.",
        },
        instantSync: {
          title: "Instant Hot Reload",
          desc: "Install or edit once, and every active agent discovers it on the next query without restarting.",
        },
        zeroWaste: {
          title: "Zero Disk Redundancy",
          desc: "Powered by native OS filesystem symlinks. 1 MB of skills consumes exactly 1 MB on disk, never duplicated.",
        },
      },
    },
    features: {
      eyebrow: "Core Capabilities",
      title: "Engineered for Velocity and Simplicity",
      subtitle: "Skill One gives you total control over the skills powering your AI assistants with zero configuration overhead.",
      bento: {
        symlink: {
          title: "Symlink Zero-Overhead Engine",
          desc: "Skill One automatically generates and repairs atomic filesystem symlinks into each agent's native directory. No background daemons, zero runtime memory footprint.",
          stat: "0 MB",
          statLabel: "Disk duplication waste",
        },
        autoDetect: {
          title: "80+ Agents Auto-Detection",
          desc: "Scans your system configuration to auto-detect installed coding assistants, IDE plugins, desktop apps, and CLI tools instantly.",
          stat: "80+",
          statLabel: "Supported AI agents",
        },
        market: {
          title: "Curated Community Market",
          desc: "Browse, search, and one-click install production-grade skills for Git workflows, UI generation, API integration, and automated research.",
          stat: "1-Click",
          statLabel: "Instant installation",
        },
        isolation: {
          title: "Per-Agent Granular Toggles",
          desc: "Want a skill active in Windsurf but excluded from Claude Desktop? Toggle any link with a single click without touching config files.",
          stat: "100%",
          statLabel: "Conflict isolation",
        },
        privacy: {
          title: "100% Local-First & Rust Powered",
          desc: "Built with Tauri v2 and Rust. No user telemetry, no cloud dependencies, and complete data privacy for enterprise and confidential repositories.",
          stat: "< 15 ms",
          statLabel: "Native launch time",
        },
      },
    },
    howItWorks: {
      eyebrow: "Seamless Workflow",
      title: "How Skill One Works in 3 Steps",
      subtitle: "From download to multi-agent productivity in less than 60 seconds.",
      steps: {
        step1: {
          num: "01",
          title: "Auto-Detect Your Ecosystem",
          desc: "Launch Skill One. It automatically scans your machine and connects to your installed IDEs, CLI agents, and desktop AI clients.",
        },
        step2: {
          num: "02",
          title: "Install or Craft Skills",
          desc: "Browse curated community skills from the market or drop your custom prompt rules and MCP configs into the hub.",
        },
        step3: {
          num: "03",
          title: "Immediately Code Everywhere",
          desc: "Open Cursor, Claude, Windsurf, or Cline. Every skill is instantly available and ready to assist.",
        },
      },
    },
    agentsExplorer: {
      eyebrow: "Broad Compatibility",
      title: "Supported AI Coding Agents",
      subtitle: "Skill One seamlessly integrates with the entire modern AI coding ecosystem. If an agent supports skills or custom rules, Skill One supports it.",
      searchPlaceholder: "Search 80+ agents (e.g. Cursor, Claude, Windsurf, Cline)...",
      filterAll: "All Agents",
      filterTop: "Popular",
      filterIde: "IDE Extensions",
      filterCli: "CLI & Terminal",
      filterDesktop: "Desktop Apps",
      emptyResult: "No agents found matching your query.",
      skillsPath: "Skills Directory",
      openWebsite: "Visit Website",
    },
    download: {
      eyebrow: "Get Started",
      title: "Experience Seamless Agent Skills Today",
      subtitle: "Free, open source, and lightweight. Download Skill One for your platform and streamline your multi-agent workflow.",
      macArm: "macOS Apple Silicon (ARM64)",
      macIntel: "macOS Intel (x64)",
      windows: "Windows (.exe / .msi)",
      linux: "Linux (.deb / AppImage)",
      releaseNotes: "View Release Notes (v0.22.0)",
      systemReq: "macOS 12+, Windows 10+, or modern Linux distribution",
      openSourceBadge: "MIT Licensed · 100% Free & Open Source",
    },
    faq: {
      eyebrow: "Answers",
      title: "Frequently Asked Questions",
      subtitle: "Everything you need to know about Skill One's architecture, security, and usage.",
      items: [
        {
          q: "How does 'Install once, ready for all agents' actually work?",
          a: "Skill One stores the canonical skill files in your central directory (~/.agents/skills). It then creates native OS filesystem symlinks directly into each agent's expected configuration directory (e.g. ~/.claude/skills, .cursor/skills, ~/.windsurf/rules). When an agent loads skills, the OS resolves the symlink seamlessly. You only ever edit or update one file.",
        },
        {
          q: "Does Skill One require a running background daemon?",
          a: "No! Once skills are symlinked, your agents interact directly with the filesystem. You only launch Skill One when you want to discover new skills, adjust settings, or inspect your agent connections.",
        },
        {
          q: "Is Skill One safe for enterprise and proprietary codebases?",
          a: "Yes, 100%. Skill One is built with Tauri v2 and Rust. It runs entirely on your local machine with zero analytics, zero network proxying of your prompts, and zero cloud lock-in.",
        },
        {
          q: "Can I enable a skill for Cursor but disable it for Claude?",
          a: "Yes. In the Agents graph, you can independently toggle the link state for each individual agent. Unlinking simply removes the symlink from that agent's folder without deleting your skill.",
        },
        {
          q: "What if an agent uses a non-standard directory?",
          a: "Skill One's agent definition engine supports custom home and config path mappings. You can easily adjust paths or contribute new agent profiles to our open-source catalog.",
        },
      ],
    },
    footer: {
      tagline: "The Universal Skill Hub for Modern AI Coding Agents.",
      rights: "Skill One Project. Open source under the MIT License.",
      links: {
        github: "GitHub Repository",
        releases: "Releases",
        docs: "Documentation",
        license: "MIT License",
      },
    },
  },
  zh: {
    nav: {
      features: "核心特性",
      howItWorks: "工作原理",
      agents: "生态支持 (80+)",
      faq: "常见问题",
      download: "立即下载",
      github: "GitHub",
      switchLang: "English",
      switchLangUrl: "/",
      langName: "简体中文",
    },
    hero: {
      badge: "专为智能体编程时代打造",
      titleStart: "一次安装，",
      titleHighlight: "所有 Agents 直接使用。",
      subtitle: "智能体技能的统一步调中心。告别在 Cursor、Claude Desktop、Windsurf、Cline 与 Roo Code 之间重复拷贝技能目录。一次点击安装，底层软链秒级穿透，零磁盘冗余，全生态即刻生效。",
      downloadMac: "免费下载 macOS 版",
      downloadSub: "Universal DMG · 完美适配 M系列芯片与 Intel",
      viewGithub: "前往 GitHub 仓库",
      trustLocal: "100% 本地运行 · 极速隐私",
      trustZeroDisk: "零磁盘冗余占用",
      trustAgents: "80+ 款主流 Agent 自动识别",
      interactivePrompt: "点击下方拓扑图中的任意技能或 Agent 开关，即刻模拟体验全生态广播联动：",
      broadcasting: "正在广播同步至全量 Agents...",
      inSync: "已同步就绪，所有活跃智能体即刻可用",
    },
    hub: {
      title: "Skill One 技能中枢",
      tagline: "统一分发中枢 · 软链拓扑网格",
      skillsLabel: "已激活技能",
      coverageLabel: "就绪智能体",
      activeSkills: "激活领域",
      clickToBroadcast: "点击下方技能卡片，模拟全生态秒级广播联动",
      guarantee: "底层软链穿透 · 零文件冗余 · 即时热生效",
      statusLinked: "已链接",
      statusActive: "生效中",
    },
    problem: {
      eyebrow: "多工具碎片化困局",
      title: "多 Agent 时代的配置噩梦",
      subtitle: "每个 AI 助手都有自己独立的规则与技能目录。管理智能体技能不应变成繁重的文件搬运工作。",
      withoutTitle: "传统多工具模式",
      withoutDesc: "碎片化存储带来的重复搬运与版本割裂",
      withTitle: "Skill One 统一架构",
      withDesc: "单一事实源与跨工具秒级软链互联",
      pains: {
        duplication: {
          title: "无休止的目录复制",
          desc: "同一个技能需要手动复制到 ~/.cursor、~/.claude、~/.windsurf 和 ~/.cline。5 个工具装 10 个技能就要维护 50 个目录。",
        },
        drift: {
          title: "版本脱节与规则失效",
          desc: "在 Cursor 中优化了提示词或修复了脚本，Claude 却仍停留在旧版本。不同工具输出标准不一，极易引发混淆。",
        },
        overhead: {
          title: "脚本冗余与路径断裂",
          desc: "自己编写 Shell 软链脚本极易在系统更新或 IDE 升级时损坏，排查断链耗费大量宝贵精力。",
        },
      },
      gains: {
        singleSource: {
          title: "单一事实源 (Single Source of Truth)",
          desc: "所有技能统一存储于中央目录 (~/.agents/skills)，每个 Agent 读取的永远是最新的真实版本。",
        },
        instantSync: {
          title: "全局秒级即时生效",
          desc: "在 Skill One 中安装或修改一次，所有配置生效的智能体在下一次提问时立即可用，无需重启。",
        },
        zeroWaste: {
          title: "零磁盘冗余占用",
          desc: "基于操作系统原生软链接机制。1 MB 技能在磁盘上仅占用 1 MB 空间，绝无冗余重复文件。",
        },
      },
    },
    features: {
      eyebrow: "核心能力",
      title: "极简、高效、专为开发者雕琢",
      subtitle: "Skill One 让您对 AI 智能体的能力掌控游刃有余，无需任何复杂的配置文件与配置学习成本。",
      bento: {
        symlink: {
          title: "软链穿透引擎 (Zero Redundancy)",
          desc: "自动为各智能体生成并修复标准原子级文件软链接。无需后台守护进程驻留，零额外运行时内存消耗。",
          stat: "0 MB",
          statLabel: "多工具冗余磁盘浪费",
        },
        autoDetect: {
          title: "80+ 款智能体全自动识别",
          desc: "启动即自动扫描本地环境，自动识别 Cursor、Claude Desktop、Windsurf、VS Code 插件及 CLI 工具的安装状态与配置路径。",
          stat: "80+",
          statLabel: "支持的主流 AI 智能体",
        },
        market: {
          title: "精选官方与社区技能集市",
          desc: "汇聚 Git 自动化流、UI 生成组件、API 深度检索、工程化文档等生产级 Skill，一键点击即刻安装。",
          stat: "1-Click",
          statLabel: "一键全生态安装",
        },
        isolation: {
          title: "单 Agent 细粒度独立开关",
          desc: "希望某技能只在 Windsurf 中启用而在 Claude 中保持纯净？图形化一键启闭，互不干扰。",
          stat: "100%",
          statLabel: "配置隔离独立度",
        },
        privacy: {
          title: "100% 本地优先 · Rust 极致性能",
          desc: "基于 Tauri v2 与 Rust 底层构建。零用户行为追踪、零云端中转依赖，对企业与私有代码仓库绝对安全。",
          stat: "< 15 ms",
          statLabel: "原生极速冷启动",
        },
      },
    },
    howItWorks: {
      eyebrow: "极简流转",
      title: "三步开启全智能体协同",
      subtitle: "从下载安装到全生态技能就绪，全程不超过 60 秒。",
      steps: {
        step1: {
          num: "01",
          title: "自动发现本地生态",
          desc: "打开 Skill One，底层引擎瞬时扫描并识别已安装的 IDE、桌面智能体与命令行工具。",
        },
        step2: {
          num: "02",
          title: "一键安装精选技能",
          desc: "在集市中挑选所需技能，或将团队现有的 prompt rules 与 MCP 配置拖入中枢。",
        },
        step3: {
          num: "03",
          title: "全工具即刻共享",
          desc: "回到 Cursor、Claude 或 Windsurf，所有技能已无缝注入，即刻享受极致生产力飞跃。",
        },
      },
    },
    agentsExplorer: {
      eyebrow: "无缝兼容",
      title: "全生态智能体深度支持",
      subtitle: "覆盖当前业界主流与前沿的 AI 编程辅助工具。只要该工具支持技能或自定义规则，Skill One 即可一键赋能。",
      searchPlaceholder: "快速搜索 80+ 款智能体 (如 Cursor, Claude, Windsurf, Cline)...",
      filterAll: "全部智能体",
      filterTop: "热门推荐",
      filterIde: "IDE 插件",
      filterCli: "命令行 CLI",
      filterDesktop: "桌面应用",
      emptyResult: "未找到与搜索词匹配的智能体。",
      skillsPath: "技能接入路径",
      openWebsite: "访问官网",
    },
    download: {
      eyebrow: "即刻起步",
      title: "体验全新智能体技能中枢",
      subtitle: "开源、免费、轻量。下载适合您平台的 Skill One，重塑您的 AI 编程流水线。",
      macArm: "macOS Apple 芯片版 (ARM64)",
      macIntel: "macOS Intel 芯片版 (x64)",
      windows: "Windows 版 (.exe / .msi)",
      linux: "Linux 版 (.deb / AppImage)",
      releaseNotes: "查看最新发行说明 (v0.22.0)",
      systemReq: "支持 macOS 12+、Windows 10+ 及主流 Linux 发行版",
      openSourceBadge: "MIT 开源协议 · 永久免费使用",
    },
    faq: {
      eyebrow: "解答疑惑",
      title: "常见问题",
      subtitle: "了解 Skill One 的技术架构、安全性与日常使用细节。",
      items: [
        {
          q: "“一次安装，所有 agents 直接使用”的底层原理是什么？",
          a: "Skill One 将原始技能存储在用户中央技能库目录 (~/.agents/skills) 中，然后利用操作系统原生软链接（Symlink），将技能透明映射至各智能体的本地配置目录（例如 ~/.claude/skills、.cursor/skills 等）。智能体读取时直接通过系统内核软链解析，不仅无需重复拷贝，且修改一次全工具同步生效。",
        },
        {
          q: "Skill One 是否需要在后台常驻后台守护进程（Daemon）？",
          a: "完全不需要！软链接一旦建立，智能体直接从本地文件系统加载技能。Skill One 仅在您需要浏览安装新技能、查看智能体连接状态或调整开关时打开，日常编码不占用任何额外系统资源。",
        },
        {
          q: "Skill One 是否适合企业内网及高安全要求的代码环境？",
          a: "完全适合。Skill One 基于 Tauri v2 与 Rust 开发，代码完全开源，所有扫描与软链操作均在本地机器执行，没有任何数据上报、网络代理或云端存储，保障企业代码绝对机密。",
        },
        {
          q: "我可以只给 Cursor 启用某个技能，而在 Claude 中禁用吗？",
          a: "可以。在拓扑管理界面中，您可以针对每一个智能体独立启闭软链链接。断开链接仅会移除该工具目录下的软链，不会删除中央仓库中的技能文件。",
        },
        {
          q: "如果某个 Agent 使用了非默认的自定义路径怎么办？",
          a: "Skill One 的 Agent 规则引擎支持自定义路径配置。您可以在设置中直接指定其技能目录，也可以向我们的开源仓库提交新的 Agent 适配规则。",
        },
      ],
    },
    footer: {
      tagline: "智能体时代的通用技能中枢 · 单一事实源 · 零冗余软链拓扑",
      rights: "Skill One 项目组 · 遵循 MIT 开源协议发布。",
      links: {
        github: "GitHub 开源仓库",
        releases: "历史发行版",
        docs: "开发与使用文档",
        license: "MIT 许可证",
      },
    },
  },
};
