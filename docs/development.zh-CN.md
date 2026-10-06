# 开发指南 (Development Guide)

[English](development.md) | [简体中文](development.zh-CN.md)

面向开发者的构建、架构、测试与技术栈说明。面向用户的基本说明见 [README](../README.zh-CN.md)。

## 技术栈

| 分层 | 选型与工具 |
| :--- | :--- |
| **桌面运行时** | [Tauri v2](https://v2.tauri.app/) + Rust |
| **前端框架** | [React 19](https://react.dev/) + TypeScript |
| **UI 组件库** | [shadcn/ui](https://ui.shadcn.com/) (`@base-ui/react` 原语 + Tailwind CSS v4) |
| **路由** | [react-router v8](https://reactrouter.com/) (HashRouter) |
| **状态与缓存** | [TanStack Query v5](https://tanstack.com/query) + IndexedDB + LocalStorage |
| **全文检索** | [MiniSearch](https://lucaong.github.io/minisearch/) |
| **构建工具** | [Vite 8](https://vite.dev/) + [oxlint](https://oxc.rs/) |
| **测试框架** | [Vitest](https://vitest.dev/) + Testing Library + Playwright |

## 环境准备

- **Node.js**：≥ 24（参考 `.nvmrc`）与 [pnpm](https://pnpm.io/)（v12+）。
- **Rust**：`rustc >= 1.88`。
- **Tauri 系统依赖**：根据操作系统参考 [Tauri 官方指引](https://v2.tauri.app/start/prerequisites/)。

## 常用命令

```bash
pnpm install          # 安装项目依赖
pnpm dev              # 启动纯前端预览（带内存 Mock）
pnpm tauri dev        # 启动原生桌面应用开发环境
pnpm typecheck        # TypeScript 类型检查
pnpm lint             # 基于 oxlint 的快速静态分析
pnpm test:run         # 执行全部单元测试
pnpm tauri build      # 构建发布版桌面安装包
```

## 项目结构

```
skill-one/
├── src/                    # 前端代码 (React 19 + TypeScript)
│   ├── components/         # 共享业务与 UI 组件
│   │   ├── ui/             # shadcn/ui 组件库
│   │   ├── app-header.tsx  # 顶栏导航与设置入口
│   │   ├── list-toolbar.tsx# 统一搜索框、视图模式切换与排序栏
│   │   ├── skill-detail/   # 技能详情抽屉、Markdown 预览及编辑器
│   │   └── settings-menu.tsx # 设置菜单弹层（CDN 源、版本更新、活动日志）
│   ├── pages/              # 核心路由页面
│   │   ├── agents/         # 首页：Agent 拓扑关系与开关关联
│   │   ├── explore/        # 商店：技能目录浏览与搜索结果展示
│   │   └── installed/      # 已安装：技能管理、分组分桶与多选批量操作
│   ├── hooks/              # 自定义 React Hooks
│   ├── lib/                # 服务层、注册表 Worker 与 Tauri IPC 封装
│   ├── data/               # 静态数据与分类字典
│   ├── App.tsx             # 路由分发与全局 Provider
│   └── main.tsx            # 前端入口
├── src-tauri/              # 原生后端代码 (Rust)
│   ├── src/                # Tauri 命令与本地文件系统交互
│   ├── capabilities/       # 安全能力与系统权限声明
│   └── tauri.conf.json     # 窗口与打包配置
├── docs/                   # 架构与技术文档
└── website/                # 官方网站 (Astro)
```

## 技术文档索引

- [系统架构与数据流](architecture.zh-CN.md)
- [技能溯源数据账本规范](skill-provenance.zh-CN.md)
- [操作活动审计日志](activity-log.zh-CN.md)
- [测试架构与分层](testing.zh-CN.md)
- [应用内签名自更新机制](auto-update.zh-CN.md)
- [SKILL.md 就地编辑方案](editing-skills.zh-CN.md)
