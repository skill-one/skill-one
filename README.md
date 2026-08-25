# Skill One

一个用于查找、安装和管理 agent skills 的桌面应用。基于 Tauri v2 构建，前端使用 React + shadcn/ui，后端由 Rust（`agents-skills` 库）提供技能安装与 agent 链接能力。

> 由 **skill-one** 组织维护：<https://github.com/skill-one>

## 功能

- **商店 / 探索**：浏览 skills 注册表，查看每个 skill 的说明（`SKILL.md`）并一键安装。
- **我的 Skills**：查看、更新与卸载已安装的技能。
- **Agent 链接**：将各类 agent（Claude Code、Cursor、Gemini CLI 等）的技能目录链接到统一目录，支持迁移已有技能。
- **设置**：可配置注册表文件的下载源（直连 GitHub 或 CDN 镜像）。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面运行时 | [Tauri v2](https://v2.tauri.app/) + Rust |
| UI | [React 19](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/)（Radix UI + Tailwind CSS） |
| 路由 | [react-router-dom v7](https://reactrouter.com/)（HashRouter） |
| 数据请求 | [TanStack Query v5](https://tanstack.com/query)（持久化到 localStorage） |
| 构建 | [Vite 5](https://vitejs.dev/) + TypeScript 5.7 |
| 测试 | [Vitest 2](https://vitest.dev/) + Testing Library |

## 环境要求

- **Node.js**（≥ 18）与 npm（或 pnpm）
- **Rust** 工具链，`rustc >= 1.88`
- **Tauri 系统依赖**：参见 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 仅启动前端（浏览器模式，使用内存 mock 数据）
npm run dev

# 3. 启动桌面应用（Tauri 开发模式）
npm run tauri dev

# 4. 运行测试
npm run test          # watch 模式
npm run test:run      # 单次运行
npm run test:coverage # 生成覆盖率报告

# 5. 构建发布包
npm run tauri build
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（端口 5173） |
| `npm run build` | 类型检查 + 前端构建 |
| `npm run preview` | 预览构建产物 |
| `npm run tauri dev` | 启动桌面应用（开发模式） |
| `npm run tauri build` | 打包桌面应用 |
| `npm run test` / `test:run` / `test:coverage` | 运行 / 单次运行 / 覆盖率测试 |

## 项目结构

```
skill-one/
├── src/                    # 前端（React + TypeScript）
│   ├── components/         # 页面与 UI 组件
│   │   └── ui/             # shadcn/ui 组件
│   ├── hooks/              # 自定义 hooks
│   ├── lib/                # API / 业务逻辑层
│   ├── types/              # 类型定义
│   ├── data/               # mock 数据
│   ├── test/               # 测试工具与 setup
│   ├── App.tsx             # 路由与布局
│   └── main.tsx            # 入口
├── src-tauri/              # 后端（Rust + Tauri）
│   ├── src/                # Tauri 命令（install/list/remove/link 等）
│   ├── capabilities/       # 权限声明
│   └── tauri.conf.json     # Tauri 配置
├── components.json         # shadcn/ui 配置
└── vite.config.ts          # Vite + Vitest 配置
```

## 架构

应用采用「前端负责读取、后端负责写入」的分层：

- **读取**：skills 注册表索引与单个 skill 的 `SKILL.md` 由前端通过可配置的下载源（直连 GitHub 或 CDN 镜像）直接拉取，并缓存到 TanStack Query。
- **写入**：技能的安装、更新、卸载，以及 agent 目录的链接/迁移，均通过 Tauri 命令委托给 Rust 侧的 `agents-skills` 库。
- **浏览器兜底**：在纯浏览器环境（开发服务器 / 测试）下，写入操作回退到内存 mock，保证 UI 可完整体验。

详细说明见 [`docs/architecture.md`](docs/architecture.md)；后端用到的 `agents-skills` 接口见 [`docs/agents-skills-api.md`](docs/agents-skills-api.md)。

## 测试

测试使用 Vitest + Testing Library，运行在 `jsdom` 环境。组件测试与 `src/lib` 下的单元测试均遵循「一个文件对应一个 `*.test.ts(x)`」的约定，可通过 `npm run test:run` 一键运行。

## 安装

### Homebrew（macOS, Apple Silicon）

```bash
brew install --cask skill-one/skill-one/skill-one
```

或先添加 tap 再安装：

```bash
brew tap skill-one/skill-one
brew install --cask skill-one
```

每次发布新版本（打 `v*` tag）时，GitHub Actions 会自动构建 `.dmg` 并发布 cask 到 [`skill-one/homebrew-skill-one`](https://github.com/skill-one/homebrew-skill-one) tap 仓库。

### 手动下载

从 [Releases](https://github.com/skill-one/skill-one/releases) 页面下载对应平台的安装包（`.dmg` / `.msi`）。
