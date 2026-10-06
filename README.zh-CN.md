# Skill One

[English](README.md) | [简体中文](README.zh-CN.md)

Skill One 是一个用于查找、安装和管理 AI Agent Skills 的开源桌面应用。基于 **Tauri v2**、**React 19** 与 **shadcn/ui** 构建，核心由 [`agents-skills`](https://github.com/skill-one) 提供本地文件系统与 Agent 目录链接支持。

> 由 **skill-one** 组织维护：<https://github.com/skill-one>

---

## 核心特性

- **Agent 拓扑中心（首页）**：可视化展示检测到的各类 AI 编程 Agent（Claude Code、Cursor、Windsurf、Trae、Gemini CLI 等）及其技能目录链接状态，支持一键关联。
- **技能探索与商店**：基于纯前端 CDN 镜像与客户端 MiniSearch 引擎，支持数十万技能的秒级全文检索、分类筛选与一键安装，兼备 skills.sh 实时发现能力。
- **已安装技能管理**：全面掌控本地技能——启停开关、自定义标签分类、时序分桶查看、批量操作、第三方未关联技能一键溯源，以及内置 CodeMirror 6 的 `SKILL.md` 就地编辑。
- **应用内签名自更新**：基于 minisign 密钥验签的一键静默更新，免去重复手动下载与 Gatekeeper 拦截。
- **操作审计日志**：本地追加式活动日志，记录每一次安装、卸载、启停与关联变更。

---

## 安装使用

在 [GitHub Releases](https://github.com/skill-one/skill-one/releases) 页面下载最新的 `.dmg` 安装包（目前支持 macOS Apple Silicon）：

1. 打开 `.dmg`，将 **Skill One** 拖入「应用程序」文件夹。
2. 启动应用。首次打开若遇到 macOS Gatekeeper 提示：
   - 右键（或 Control + 点击）**Skill One** → 选择**打开**；或
   - 进入 **系统设置 → 隐私与安全性** → 点击**仍要打开**；或
   - 在终端执行：`xattr -d com.apple.quarantine "/Applications/Skill One.app"`

后续版本将通过应用内自更新功能无缝升级，无需再次手动操作。

---

## 功能页面

- **Agent 拓扑 (`/`)**：呈现所有受支持 Agent 的连接状态、连线脉冲与统一链接控制。
- **技能探索 (`/explore`)**：浏览上游技能注册表、按领域分类筛选或实时检索。
- **我的技能 (`/installed`)**：管理本地技能，支持按热度/时间/标签分组、多选批量启停与删除。
- **设置菜单**：配置 CDN 镜像下载源、查看活动日志与检查软件更新。

---

## 开发者文档

开发者构建、架构与测试说明见 [docs/](docs/) 目录：

- [系统架构与数据流](docs/architecture.zh-CN.md)
- [本地开发与构建指南](docs/development.zh-CN.md)
- [测试架构与分层](docs/testing.zh-CN.md)
- [技能溯源数据账本规范](docs/skill-provenance.zh-CN.md)
- [操作活动审计日志](docs/activity-log.zh-CN.md)
- [应用内自更新机制](docs/auto-update.zh-CN.md)
