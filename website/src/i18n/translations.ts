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
  universalInstall: {
    eyebrow: string;
    title: string;
    subtitle: string;
    tabs: {
      market: string;
      cli: string;
      chat: string;
      git: string;
    };
    centralRepoLabel: string;
    centralRepoPath: string;
    physicalSingleNotice: string;
    symlinkedToAgents: string;
    marketTab: {
      searchPlaceholder: string;
      skillName: string;
      skillDesc: string;
      installBtn: string;
      installedBtn: string;
      installedFeedback: string;
    };
    cliTab: {
      termTitle: string;
      runBtn: string;
      runningBtn: string;
      copyBtn: string;
      copiedBtn: string;
    };
    chatTab: {
      chatTitle: string;
      promptInput: string;
      userMessage: string;
      agentMessage: string;
      askAnotherBtn: string;
    };
    gitTab: {
      termTitle: string;
      explain: string;
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
    directDownload: string;
    comingSoon: string;
    comingSoonBadge: string;
    toastIntel: string;
    toastWindows: string;
    toastLinux: string;
    recommended: string;
    macSubtext: string;
    winSubtext: string;
    linuxSubtext: string;
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
      subtitle: "The single source of truth for Agent Skills. Skill One symlinks all your AI coding assistants into the exact same central skills repository (~/.agents/skills). Whether installed via the built-in market, 'npx skills', direct agent dialogues, or git clone, every tool has immediate access with zero duplication.",
      downloadMac: "Download for macOS (Direct DMG)",
      downloadSub: "Apple Silicon (M1-M4) · Direct DMG Download",
      viewGithub: "View on GitHub",
      trustLocal: "100% Local-First & Private",
      trustZeroDisk: "Zero Disk Duplication",
      trustAgents: "80+ Agents Auto-Detected",
      interactivePrompt: "All agents point to the exact same physical repository. Click any skill below to visualize how all agents immediately share it:",
      broadcasting: "Physical single source active across all agents...",
      inSync: "In Sync across all active agents",
    },
    hub: {
      title: "Skill One Hub",
      tagline: "Single Source of Truth · Multi-Channel Compatible (~/.agents/skills)",
      skillsLabel: "Skills Active",
      coverageLabel: "Agents Ready",
      activeSkills: "Active Domains",
      clickToBroadcast: "Single physical repo · Broadcast animation illustrates instant readiness",
      guarantee: "Pure Symlinks · Store/npx/Agent Compatible · Zero Redundancy",
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
          desc: "All agents transparently symlink to the exact same physical repository (~/.agents/skills). Works seamlessly with the built-in store, 'npx skills', CLI tools, or in-agent installations.",
        },
        instantSync: {
          title: "Instant Physical Readiness (No Daemons)",
          desc: "No background synchronization daemons or file copy latency. Because all tools physically point to the exact same directory, any skill added or updated is immediately available across all agents on the next prompt.",
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
          title: "Universal Install Sources (Market / npx / Agents)",
          desc: "Install skills from Skill One's curated store, via 'npx skills', through direct Agent chat commands, or git clone. Since every tool symlinks to the same central repository, all sources work instantly without boundaries.",
          stat: "Universal",
          statLabel: "Store · npx · Agent-Install · Git",
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
    universalInstall: {
      eyebrow: "Multi-Channel Architecture",
      title: "One Single Repository. Any Installation Workflow.",
      subtitle: "Because Skill One unites all agents around a single physical folder (~/.agents/skills) via OS symlinks, you can install skills however you want. No proprietary lock-in, zero manual file copying.",
      tabs: {
        market: "Skill Store (GUI)",
        cli: "npx skills add (CLI)",
        chat: "In-Agent Chat Prompt",
        git: "Git Clone & Manual Drop",
      },
      centralRepoLabel: "Single Physical Repository",
      centralRepoPath: "~/.agents/skills",
      physicalSingleNotice: "Single physical directory on disk · Zero duplication",
      symlinkedToAgents: "Transparently shared with all 80+ AI Agents via OS symlinks",
      marketTab: {
        searchPlaceholder: "Search 2,000+ community skills...",
        skillName: "shadcn-ui-mastery",
        skillDesc: "Tailored UI design guidelines and Shadcn component templates for Cursor, Claude, and Windsurf.",
        installBtn: "Install to Hub",
        installedBtn: "Installed to Hub",
        installedFeedback: "Skill stored at ~/.agents/skills/shadcn-ui-mastery. All 80+ agents instantly linked!",
      },
      cliTab: {
        termTitle: "Terminal — zsh",
        runBtn: "Run in Terminal",
        runningBtn: "Executing...",
        copyBtn: "Copy Command",
        copiedBtn: "Copied!",
      },
      chatTab: {
        chatTitle: "Cursor / Claude Composer",
        promptInput: "Ask agent to install a skill...",
        userMessage: "Hey, please install the official 'shadcn-ui' and 'git-workflow' skills for my project.",
        agentMessage: "Done! I've fetched the skill into ~/.agents/skills/. Because Skill One maintains central OS symlinks, this skill is immediately accessible in Cursor, Windsurf, Claude Code, and all your other agents without restart.",
        askAnotherBtn: "Try Chat Example",
      },
      gitTab: {
        termTitle: "Local Filesystem / Git Clone",
        explain: "Prefer crafting your own skills or cloning private enterprise repositories? Simply clone or drag any skill folder directly into ~/.agents/skills/. Every agent recognizes it instantly.",
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
      directDownload: "Direct Download (.dmg)",
      comingSoon: "Coming Soon",
      comingSoonBadge: "Coming Soon",
      toastIntel: "macOS Intel version coming soon! Stay tuned.",
      toastWindows: "Windows version is in progress and coming soon!",
      toastLinux: "Linux (.deb / AppImage) version is in progress and coming soon!",
      recommended: "Recommended",
      macSubtext: "Direct DMG Download · For Apple Silicon (M1/M2/M3/M4)",
      winSubtext: "Native Windows Symlink Support · In Progress",
      linuxSubtext: "Standard Posix Symlink Architecture · In Progress",
    },
    faq: {
      eyebrow: "Answers",
      title: "Frequently Asked Questions",
      subtitle: "Everything you need to know about Skill One's architecture, security, and usage.",
      items: [
        {
          q: "How does 'Install once, ready for all agents' actually work?",
          a: "Skill One's core principle is that all agents share the exact same physical skills repository (~/.agents/skills). It creates native OS filesystem symlinks directly into each agent's expected configuration directory (e.g. ~/.claude/skills, .cursor/skills, ~/.windsurf/rules). Because all tools point to the exact same files, there is zero data duplication, no background daemons, and no file synchronization overhead. Any skill added via the Skill One store, 'npx skills', or an agent's chat is immediately accessible everywhere.",
        },
        {
          q: "Can I install skills via 'npx skills' or directly ask an Agent in chat to install them?",
          a: "Absolutely yes! Skill One is 100% compatible with any third-party installation workflow. Because every agent's skill directory symlinks to the exact same physical repository (~/.agents/skills), skills installed via 'npx skills add', direct agent prompts, third-party CLI tools, or git clone are immediately recognized by all other 80+ agents without any manual syncing.",
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
      subtitle: "智能体技能的单一物理源。Skill One 的核心原理是让所有 AI 编程助手通过底层软链接指向同一个中央技能仓库 (~/.agents/skills)。无论是在内置集市安装、使用 'npx skills' 命令行安装，还是在对话中直接让 Agent 安装或手动 git clone，所有智能体均可直接使用，本就是同一个物理仓库，零冗余秒级穿透。",
      downloadMac: "直接下载 macOS 安装包",
      downloadSub: "Apple Silicon (M1-M4) · 直接下载 DMG 安装包",
      viewGithub: "前往 GitHub 仓库",
      trustLocal: "100% 本地运行 · 极速隐私",
      trustZeroDisk: "零磁盘冗余占用",
      trustAgents: "80+ 款主流 Agent 自动识别",
      interactivePrompt: "所有智能体底层共享同一物理仓库。点击下方技能，直观可视化其如何在所有 Agent 间即刻生效：",
      broadcasting: "单一物理事实源，各智能体已全部直接穿透访问...",
      inSync: "所有活跃智能体均已指向同一仓库，即刻可用",
    },
    hub: {
      title: "Skill One 技能中枢",
      tagline: "单一物理事实源 · 支持集市 / npx / Agent直接安装 (~/.agents/skills)",
      skillsLabel: "已激活技能",
      coverageLabel: "就绪智能体",
      activeSkills: "激活领域",
      clickToBroadcast: "底层共享同一物理仓库 · 动效直观展示所有 Agent 的即刻就绪",
      guarantee: "纯软链穿透 · 兼容集市 / npx / 对话安装 · 零冗余",
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
          title: "共享同一技能仓库 (单一事实源)",
          desc: "所有智能体通过软链接直接指向统一的技能仓库 (~/.agents/skills)。完美支持内置集市、npx skills 命令行、第三方工具或在 Agent 对话中直接安装，全生态无缝互通。",
        },
        instantSync: {
          title: "物理同一仓库 · 即刻就绪 (无需后台守护)",
          desc: "因为所有工具在物理上指向同一个目录，因此无需任何后台同步进程或文件拷贝延迟。任何方式安装或更新技能，所有 Agent 在下一次对话中立即可用。",
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
          title: "多元安装方式全兼容 (集市 / npx / 对话安装)",
          desc: "既可在 Skill One 优雅集市中浏览安装，也可通过 `npx skills`、在 Cursor/Claude 对话中让 Agent 直接安装，或手动 git clone。本质同源，任意方式安装均全生态通用。",
          stat: "全渠道支持",
          statLabel: "集市 · npx · 对话安装 · Git",
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
    universalInstall: {
      eyebrow: "全渠道同源架构",
      title: "同一个技能仓库，支持任意安装方式",
      subtitle: "Skill One 的底层核心是让所有智能体通过系统软连接共享同一个物理仓库 (~/.agents/skills)。因此不仅支持在软件集市中一键安装，更完美兼容第三方命令行、直接在 Agent 对话中安装或 git clone，零门槛零迁移成本。",
      tabs: {
        market: "Skill One 集市 (GUI)",
        cli: "npx skills add (命令行)",
        chat: "Agent 对话直接安装",
        git: "Git Clone / 本地拖拽",
      },
      centralRepoLabel: "中央物理技能仓库",
      centralRepoPath: "~/.agents/skills",
      physicalSingleNotice: "磁盘上真实存在的物理目录 · 绝无重复文件",
      symlinkedToAgents: "通过内核级系统软链接，实时穿透至 80+ 款 AI 智能体",
      marketTab: {
        searchPlaceholder: "快速搜索 2,000+ 社区精选技能...",
        skillName: "shadcn-ui-mastery",
        skillDesc: "专为 Cursor、Claude、Windsurf 深度定制的 Shadcn/UI 与现代化设计组件最佳实践技能包。",
        installBtn: "一键安装到中枢",
        installedBtn: "已安装至中央仓库",
        installedFeedback: "技能已存入 ~/.agents/skills/shadcn-ui-mastery，所有 80+ 款智能体秒级直接可用！",
      },
      cliTab: {
        termTitle: "终端 — zsh",
        runBtn: "模拟运行命令",
        runningBtn: "正在执行...",
        copyBtn: "复制命令",
        copiedBtn: "已复制！",
      },
      chatTab: {
        chatTitle: "Cursor / Claude 对话窗口",
        promptInput: "在对话框直接对智能体下达安装指令...",
        userMessage: "请帮我安装 shadcn-ui 和 git-workflow 技能，并在本项目中启用。",
        agentMessage: "已为您将技能直接保存至中央仓库 ~/.agents/skills/。得益于 Skill One 的原生软链架构，不仅我可以直接读取，您的 Cursor、Windsurf、Claude Code 及其他 80+ 款智能体也已同步就绪！",
        askAnotherBtn: "模拟对话安装",
      },
      gitTab: {
        termTitle: "本地文件系统 / Git Clone",
        explain: "喜欢自研私有技能或从 GitHub 团队仓库同步？只需将任意技能文件夹放入 ~/.agents/skills/，全生态工具立即自动感知，无需任何复杂的注册配置。",
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
          title: "任意方式安装技能",
          desc: "在集市中挑选技能，或通过 `npx skills`、在 Agent 对话中直接安装，所有方式均落入统一仓库。",
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
      directDownload: "直接下载 (.dmg)",
      comingSoon: "即将推出",
      comingSoonBadge: "即将推出",
      toastIntel: "macOS Intel 芯片版本即将推出，敬请期待！",
      toastWindows: "Windows 版本正在积极开发适配中，即将推出！",
      toastLinux: "Linux (.deb / AppImage) 版本正在适配中，即将推出！",
      recommended: "官方推荐",
      macSubtext: "点击直接下载 DMG 安装包 · 完美适配 M1/M2/M3/M4",
      winSubtext: "原生 Windows 软链与多 Agent 支持 · 开发中",
      linuxSubtext: "标准 Linux 软链规范与生态支持 · 开发中",
    },
    faq: {
      eyebrow: "解答疑惑",
      title: "常见问题",
      subtitle: "了解 Skill One 的技术架构、安全性与日常使用细节。",
      items: [
        {
          q: "“一次安装，所有 agents 直接使用”的底层原理是什么？",
          a: "Skill One 的核心原理是让所有智能体通过软连接共享同一个物理 skills 仓库 (~/.agents/skills)。它会自动在各工具的配置目录（如 ~/.claude/skills、.cursor/skills 等）创建系统原生软链接。因此本质上所有 Agent 读写的就是同一份物理文件，无需拷贝也无需后台文件分发广播，所有工具立即共享更新。",
        },
        {
          q: "支持通过 'npx skills' 或者直接在 Agent 对话中让它安装技能吗？",
          a: "完全支持！因为所有 Agent 的技能目录底层都软链接到了同一个中央仓库 (~/.agents/skills)，所以无论是在 Skill One 界面中安装、使用 'npx skills add' 命令安装、直接在 Cursor/Claude 对话中让 Agent 下载安装，还是 git clone，技能都会落入同一个仓库，其他所有 80+ 款智能体都能立即识别和使用。",
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
      tagline: "智能体时代的通用技能中枢 · 单一物理事实源 · 零冗余软链拓扑",
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
