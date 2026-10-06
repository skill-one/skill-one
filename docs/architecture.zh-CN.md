# 架构设计 (Architecture)

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

## 概述

Skill One 是一个基于 Tauri v2 构建的桌面端应用。前端（React 19）负责界面呈现与数据读取，后端（Rust + `agents-skills`）负责本地文件系统操作与 Agent 技能目录链接。

```
┌─────────────────────────────────────────────────────────┐
│                   React 前端 (WebView)                  │
│  components / hooks / lib / pages                       │
│   ├── 读取: lib/registry/, worker.ts, search-index.ts   │
│   │         └─ CDN 镜像 (jsDelivr / JSDMirror)          │
│   ├── 状态: TanStack Query v5 + IDB + LocalStorage      │
│   └── 写入: local-skills.ts ──► skills-manager.ts       │
│                                 └─ invoke (Tauri IPC)   │
└──────────────────────────┬──────────────────────────────┘
                           │ Tauri IPC
┌──────────────────────────▼──────────────────────────────┐
│                   Rust 后端 (src-tauri)                 │
│   skills.rs: 安装 / 卸载 / 启停 / Agent 链接            │
│   dir_fingerprint.rs: 轻量级 stat 目录变动指纹检测      │
│   provenance.rs: 技能元数据账本 (.skill-one.json)       │
│   activity.rs: 追加式审计操作日志                       │
│   └─ agents-skills crate                                │
└─────────────────────────────────────────────────────────┘
```

## 职责划分

### 1. 前端（读取与检索）

- **`src/lib/registry/`**：后台注册表数据服务。通过独立的 Web Worker（`worker.ts`）从 CDN 镜像流式下载并分块解析 `skills.jsonl` 到 IndexedDB，完全不阻塞主渲染线程。
- **`src/lib/search-index.ts`**：基于 MiniSearch 的高性能客户端全文检索索引，针对技能标识符与分类信息实现毫秒级搜索。
- **`src/lib/cdn-config.ts`**：自适应下载源链路：直连 GitHub → JSDMirror / jsDelivr 镜像 → 自定义 CDN。
- **缓存持久化**：结合 TanStack Query 与 IndexedDB，实现冷启动零延迟离线渲染与后台静默增量刷新。

### 2. 后端（系统与文件系统）

- **`src-tauri/src/skills.rs`**：暴露 Tauri IPC 命令，封装 `agents-skills::Manager` 执行技能安装、目录链接与迁移。阻塞型 IO 操作全部交由 `spawn_blocking` 线程池执行。
- **`src-tauri/src/dir_fingerprint.rs`**：基于 `mtime` 与 `size` 的轻量级目录指纹比对算法，无需读取文件内容即可秒级判断本地技能变动。
- **`src-tauri/src/provenance.rs`**：负责原子化读写存放在 `~/.agents/skills/.skill-one.json` 的技能元数据账本。
- **`src-tauri/src/activity.rs`**：负责 `<app_log_dir>/activity.jsonl` 的追加式审计日志记录，并实现 2 MiB 自动滚动。

### 3. 浏览器模拟回退

在纯浏览器开发调试或测试环境（`pnpm dev` / Vitest）中，`isTauri()` 返回 `false`，前端自动平滑降级使用内存模拟数据（`mock-local.ts`）。

## 核心模块索引

| 模块 / 路径 | 职责定位 |
| :--- | :--- |
| `src/App.tsx` | 应用外壳、HashRouter 路由分发、缓存持久化配置与后台刷新 |
| `src/pages/agents/` | 首页：Agent 拓扑关系图、状态连线及直接点击关联开关 |
| `src/pages/explore/` | 商店页：技能目录浏览、多源搜索结果展示与仓库卡片展开 |
| `src/pages/installed/` | 已安装页：技能管理、标签分类、时序分桶与多选批量操作 |
| `src/pages/installed/installed-grouping.ts` | 排序、时序分桶、语义分组等纯函数计算模块 |
| `src/pages/installed/use-installed-bulk-actions.ts` | 封装多选批量启停、批量打标、批量关联与删除的自定义 Hook |
| `src/components/skill-detail/` | 技能详情抽屉：Markdown 预览编辑（CodeMirror 6）与标签管理 |
| `src/components/list-toolbar.tsx` | 统揽搜索输入框、布局视图切换（卡片/行/网格）与排序菜单的工具栏 |
| `src/lib/provenance.ts` | 客户端数据对齐逻辑与 `.skill-one.json` 结构处理 |

## 核心数据流

- **安装技能**：用户点击安装 → `local-skills.ts` 传入 `owner/repo/slug` → 调用 Tauri 命令 `install_skill` → `agents-skills` 下载 tarball 并提取 → 刷新 React Query 缓存 → 追加写入活动日志。
- **注册表同步**：应用启动 → Worker 优先读取 IndexedDB 本地缓存 → 发送带缓存校验的 `HEAD` 请求获取最新快照 ETag → 若有更新则流式拉取不可变的 SHA 固定版本 `skills.jsonl` → 分块存入 IndexedDB 并重建 MiniSearch 索引。
