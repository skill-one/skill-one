# Skill One 宣传官网开发文档

本文档总结基于 Astro 构建的 Skill One 官方宣传网站的设计架构、业界最佳实践与开发指南。

## 一、 核心设计理念与业界最佳实践

官网严格遵照业界顶级开发者工具（如 Linear、Raycast、Vercel）宣传页面的最佳实践进行设计与实现：

1. **瞬时价值传达（3 秒原则）**：
   - 首屏清晰有力回答“是什么”与“为什么需要它”。
   - 核心标语：*“一次安装，所有 Agents 直接使用。”*
   - 直击核心痛点：告别在 Cursor、Claude Desktop、Windsurf、Cline 与 Roo Code 之间重复复制技能目录。

2. **招牌级交互呈现（参考软件 Agents 页拓扑效果）**：
   - 完美复刻软件核心的 **Agents 拓扑图与技能中枢卡片**。
   - 居中呈现 Skill One 技能中枢，展示实时激活技能标签、分类领域统计与就绪覆盖率。
   - 左右对称分布智能体卡片（Cursor、Claude、Windsurf、Cline、Antigravity、Roo Code、Codex、Goose），通过原生水平 S 形 SVG 彩色能量曲线相连，辅以动态流动光效。
   - 访客可自由点击中枢技能或单个 Agent 开关，触发全局脉冲广播动画，直观感受底层操作系统软链接带来的秒级热生效体验。

3. **软件核心底层原理（共享同一物理仓库）**：
   - 软件原理是使得所有 agents 通过操作系统底层软链接**指向同一个 skills 仓库**（`~/.agents/skills`）。
   - 全面兼容任意来源的安装方式：
     - 在 Skill One 内置集市一键安装
     - 通过第三方 CLI 工具安装（如 `npx skills add ...`）
     - 在 Cursor/Claude 等 Agent 对话中直接让智能体安装
     - 手动 git clone 或本地拖拽
   - 因为本就是同一个物理仓库，所有工具读取的都是同一份文件，无需后台文件分发广播；官网界面中的广播动画仅作为帮助用户直观理解“所有智能体已即刻就绪”的视觉隐喻。

4. **全渠道安装方式交互演练场（`UniversalInstallShowcase.tsx`）**：
   - 提供 4 标签可交互演练工作流（集市 GUI、`npx skills` 终端模拟运行与复制、Agent 对话直接下达指令、Git clone 终端）。
   - 联动右侧单一物理源收敛架构图（`~/.agents/skills` 唯一物理实体），动态展现向 Cursor、Claude、Windsurf、Cline 的 0 延时软链穿透，支持一键重置演练。

5. **平台下载与即将推出策略**：
   - **已支持平台（macOS Apple 芯片 ARM64）**：点击下载直接触发 DMG 文件下载（`Skill.One_0.22.0_aarch64.dmg`），无需跳转至 GitHub 源仓库或 Releases 页面。
   - **暂未支持平台（macOS Intel x64、Windows、Linux）**：展示“即将推出”状态，点击后弹出轻量 Toast 提示框告知开发适配进度，提供真实的开发中反馈。
   - **首屏快速平台选择器**：在主 CTA 按钮下方直接展现各系统支持状态与即将推出快速弹窗。

6. **强烈反差故事线（痛点与方案对比）**：
   - 左右对比“传统多工具孤岛模式”与“Skill One 单一事实源方案”，突出零磁盘冗余与版本零割裂。

7. **便当盒（Bento Grid）特性阵列**：
   - 提炼 5 大核心架构技术支柱：
     - 原生软链穿透引擎（零重复文件）
     - 80+ 款智能体全自动扫描识别
     - 多元安装方式全兼容（集市 / npx / 对话安装）
     - 单 Agent 细粒度独立启闭开关
     - 100% 本地优先与 Rust 极致性能

8. **全生态智能体搜索矩阵**：
   - 提供 81 款主流 AI 编程助手交互式检索与分类筛选器（全部、热门、IDE 插件、CLI 命令行、桌面端），带官方图标、`/` 快捷键聚焦，以及点击一键复制技能目录路径与反馈。

9. **技术与 SEO 极致优化**：
   - 基于 Astro 5 静态站点生成（SSG），实现极致的首屏加载性能。
   - 采用 React 独立岛（Island Architecture），兼顾强交互性与极小客户端运行时。
   - 原生支持英文（`/`）与简体中文（`/zh/`）无缝切换。
   - 完整配置 OpenGraph、Twitter Cards 及 schema.org `SoftwareApplication` 结构化数据。

## 二、 目录结构

```text
website/
├── astro.config.mjs         # Astro 配置文件，集成 React 与 Tailwind Vite 插件
├── package.json             # 工作区包配置
├── tsconfig.json            # TypeScript 配置
├── public/                  # 静态资源（图标、透明品牌 Logo、80+ Agent 官方图标）
└── src/
    ├── styles/global.css    # Tailwind CSS v4 设计变量与动画
    ├── data/agents.json     # 81 款支持的智能体元数据
    ├── i18n/translations.ts # 中英文双语文字字典
    ├── layouts/Layout.astro # 基础布局（含 SEO、OpenGraph 与结构化数据）
    ├── components/
    │   ├── Navbar.tsx       # 响应式导航栏（含语言切换）
    │   ├── Hero.astro       # 首屏区域（含下载入口与信任背书）
    │   ├── HeroAgentGraph.tsx # 高保真交互式 S 曲线拓扑图岛
    │   ├── UniversalInstallShowcase.tsx # 全渠道安装交互演练场
    │   ├── ProblemSolution.astro # 痛点与收益对比
    │   ├── BentoFeatures.astro   # 五大架构能力便当盒
    │   ├── AgentEcosystem.tsx    # 81 款智能体检索展示矩阵
    │   ├── HowItWorks.astro      # 三步使用流程
    │   ├── DownloadCards.tsx     # 平台直接下载卡片与即将推出 Toast
    │   ├── DownloadSection.astro # macOS、Windows、Linux 下载模块
    │   ├── FAQSection.astro      # 开发者常见问题折叠列表
    │   └── Footer.astro          # 页脚链接与版权信息
    └── pages/
        ├── index.astro      # 英文版首页
        └── zh/index.astro   # 中文版首页
```

## 三、 本地开发与预览指南

在仓库根目录下执行：

```bash
# 启动本地开发服务（运行在独立 4321 端口，不占用 5173）
pnpm --filter website dev

# 构建生产包
pnpm --filter website build

# 预览构建产物
pnpm --filter website preview
```

访问地址：
- **英文版**：`http://localhost:4321/`
- **中文版**：`http://localhost:4321/zh/`
