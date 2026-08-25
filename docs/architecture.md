# 架构说明

## 概览

Skill One 是一个 Tauri v2 桌面应用，前端（React）负责渲染与数据读取，后端（Rust）负责所有会修改本地文件系统的操作。

```
┌─────────────────────────────────────────────────────────┐
│                     React 前端 (WebView)                  │
│  components / hooks / lib                               │
│   ├── 读取: skills-api.ts, skill-detail-api.ts           │
│   │         └─ cdn-config.ts (直连 GitHub / CDN 镜像)    │
│   ├── 写入: local-skills.ts ──► skills-manager.ts        │
│   │                             └─ invoke (Tauri IPC)    │
│   └── 兜底: mock-local.ts (浏览器模式内存数据)            │
└──────────────────────────┬──────────────────────────────┘
                           │ Tauri IPC
┌──────────────────────────▼──────────────────────────────┐
│                    Rust 后端 (src-tauri)                 │
│   skills.rs: install / list / remove / update / link     │
│   └─ agents-skills 库 (crates.io 依赖)                  │
└─────────────────────────────────────────────────────────┘
```

## 职责划分

### 前端（读取）

- **`src/lib/skills-api.ts`**：拉取并解析 skills 注册表索引（JSONL），按页返回技能列表。
- **`src/lib/skill-detail-api.ts`**：按需拉取单个 skill 的 `SKILL.md`，解析 frontmatter 与正文。
- **`src/lib/cdn-config.ts`**：管理下载源。默认直连 `raw.githubusercontent.com`，失败后回退到 CDN 镜像（`cdn.jsdmirror.com`），并支持用户在「设置」中配置自定义 CDN。候选地址按优先级依次尝试，配置持久化到 localStorage。

读取数据通过 TanStack Query 统一缓存与持久化（`staleTime` 10 分钟、`gcTime` 无限），重启后可先从缓存渲染再后台刷新。

### 后端（写入）

- **`src-tauri/src/skills.rs`**：暴露 6 个 Tauri 命令（`install_skill`、`list_installed_skills`、`remove_skills`、`update_skills`、`link_agents`、`link_status`），全部通过 `spawn_blocking` 将阻塞操作（git clone、install、link 等）移出主线程。
- 命令内部委托给 `agents-skills` 库的 `Manager` 门面，返回 camelCase 的 DTO 给前端。

### 前端写入封装

- **`src/lib/skills-manager.ts`**：对 Tauri 命令的类型化封装（`invoke`）。
- **`src/lib/local-skills.ts`**：面向 UI 的数据访问层，统一处理「Tauri 后端 / 浏览器 mock」两套实现，对组件透明。

### 浏览器兜底

当应用不在 Tauri 环境（如 `npm run dev` 或 Vitest 测试）时，`isTauri()` 返回 `false`，`local-skills.ts` 会回退到 `mock-local.ts` 的内存数据，使 UI 与交互流程无需原生环境即可完整预览。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 路由、布局、TanStack Query Provider 与缓存持久化 |
| `src/components/app-sidebar.tsx` | 侧边栏导航（路由与标题共用同一份配置） |
| `src/lib/tauri.ts` | 判断是否运行在 Tauri WebView 中 |
| `src/lib/open-external.ts` | 在系统浏览器中打开外链（Tauri 需 opener 插件） |
| `src-tauri/tauri.conf.json` | 窗口、构建与打包配置 |
| `src-tauri/capabilities/default.json` | 权限声明（`core:default`、`opener:default`、窗口标题） |

## 数据流示例

**安装一个 skill**：

1. 用户在探索页点击「安装」。
2. `local-skills.installSkillFromSource(repo, name)` 判断环境。
3. Tauri 环境 → `skills-manager.installSkill` → `invoke("install_skill", ...)` → Rust `install_skill` 命令 → `agents-skills::Manager.add`。
4. 完成后前端刷新 `installed-skills` 查询缓存。
5. 浏览器环境 → 写入 `mock-local.installMockSkill`。

**探索技能列表**：

1. `explore-page` 通过 `fetchSkillsPage(page)` 请求数据。
2. `skills-api.ts` 首次拉取完整索引（按会话缓存），本地切片分页。
3. `cdn-config.ts` 依序尝试直连 GitHub 与 CDN 镜像。
4. TanStack Query 缓存结果并持久化，翻页与重启后优先命中缓存。
