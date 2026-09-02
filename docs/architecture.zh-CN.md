# 架构说明

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

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
│   skills.rs: install / list / remove / enable / link     │
│   └─ agents-skills 库 (crates.io 依赖)                  │
└─────────────────────────────────────────────────────────┘
```

## 职责划分

### 前端（读取）

- **`src/lib/registry/`**：把注册表当作一个服务来访问——`client.ts` 是 `worker.ts` 在主线程的代理，`index-stream.ts` 先探测已发布快照再流式拉取并解析 `index.jsonl`（逐行解析，下载进行中即可逐步拿到 skill），`worker-controller.ts` 应答分页浏览、搜索、精选与元数据查询，`cache.ts` 持久化解析结果。调用方经由它完成过滤、排序与分页，自身不持有全量注册表。
- **`src/lib/skill-detail-api.ts`**：按需拉取单个 skill 的 `SKILL.md`，解析 frontmatter 与正文。
- **`src/lib/cdn-config.ts`**：管理下载源。默认直连 `raw.githubusercontent.com`，失败后回退到 CDN 镜像（`cdn.jsdmirror.com`），并支持用户在「设置」中配置自定义 CDN。候选地址按优先级依次尝试——包括响应体中途失败时——配置持久化到 localStorage。

读取数据通过 TanStack Query 缓存（`staleTime` 10 分钟、`gcTime` 无限），重启后可先从缓存渲染再后台刷新。每个候选请求带 10 秒超时，仅守护响应头；流式响应体另有分块间的停滞超时（数 MB 的下载本就可能超过任何固定上限）。注册表索引还有两层专属持久化，都在 worker 内部：IndexedDB 里的解析结果，以及它所定址的 commit（见「浏览 skill 列表」）；两者合起来让一次启动在「上游没有新发布」时完全跳过下载。已安装列表、agent 状态等小体量查询由 TanStack Query 落盘；解析后的索引体积远超 WebView localStorage 配额，刻意排除在外。

### 后端（写入）

- **`src-tauri/src/skills.rs`**：暴露 7 个 Tauri 命令（`install_skill`、`list_installed_skills`、`remove_skills`、`set_skills_enabled`、`link_agents`、`link_status`、`read_skill_md`），全部经由共享的 `spawn_blocking` 辅助函数把阻塞操作（git clone、install、link 等）移出异步运行时。
- 命令内部委托给 `agents-skills` 库的 `Manager` 门面，返回 camelCase 的 DTO 给前端。自 `agents-skills` 0.9 起，链接不再因目录已有内容而拒绝：agent 既有内容会被移入备份槽（带 migrate 时采纳进全局目录），取消链接时恢复，原先的 `remove_stray_files` 命令随之移除。

### 前端写入封装

- **`src/lib/skills-manager.ts`**：对 Tauri 命令的类型化封装（`invoke`）。
- **`src/lib/local-skills.ts`**：面向 UI 的数据访问层，统一处理「Tauri 后端 / 浏览器 mock」两套实现，对组件透明。

### 浏览器兜底

当应用不在 Tauri 环境（如 `pnpm dev` 或 Vitest 测试）时，`isTauri()` 返回 `false`，`local-skills.ts` 会回退到 `mock-local.ts` 的内存数据，使 UI 与交互流程无需原生环境即可完整预览。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 路由、布局、TanStack Query Provider 与缓存持久化 |
| `src/components/app-sidebar.tsx` | 侧边栏导航（路由与标题共用同一份配置），以及导航角标：「全部」显示已流式下载的 skill 数，「仓库」在索引就绪后显示聚合的仓库总数 |
| `src/pages/explore/featured/` | 精选页：计算生成的榜单 hero 轮播 + 本地策划的分类区块 |
| `src/data/featured-content.ts` | 精选页的分类 → skill 策划引用（注册表索引不含分类字段） |
| `src/lib/tauri.ts` | 判断是否运行在 Tauri WebView 中 |
| `src/lib/open-external.ts` | 在系统浏览器中打开外链（Tauri 需 opener 插件） |
| `src-tauri/tauri.conf.json` | 窗口、构建与打包配置 |
| `src-tauri/capabilities/default.json` | 权限声明（`core:default`、`opener:default`） |

## 数据流示例

**安装一个 skill**：

1. 用户在探索页点击「安装」。
2. `local-skills.installSkillFromSource(repo, name)` 判断环境。
3. Tauri 环境 → `skills-manager.installSkill` → `invoke("install_skill", ...)` → Rust `install_skill` 命令 → `agents-skills::Manager.add`。
4. 完成后前端刷新 `installed-skills` 查询缓存。
5. 浏览器环境 → 写入 `mock-local.installMockSkill`。

**探索技能列表**：

1. 注册表跑在按需创建的 worker 里（`lib/registry/client.ts` 是 `lib/registry/worker.ts` 的主线程代理）：主线程只接收分页结果与进度事件，从不持有 ~12 MB 索引。
2. 启动时 worker 先从 IndexedDB 读取解析结果（`lib/registry/cache.ts`）并立即用于渲染——冷启动不等网络。
3. 随后探测 `index-meta.json` 拿到已发布的 `distCommit`，该请求带打散缓存的时间戳，避免任何缓存副本把旧 commit 冒充成当前版本。commit 与缓存一致时：**完全跳过多 MB 的正文下载**。
4. 否则 `registry/index-stream.ts` 拉取**定址到该 commit** 的 `index.jsonl`（不可变，镜像里的副本必然是正确字节），每收到一行就解析一行；页面直接用部分数据渲染。按注册表顺序时部分列表始终是完整列表的前缀，因此翻页稳定、仅总数不断上涨；但列表按下载量排序，首页是「当前最好的一批」，随着数据继续到达，早先的行的会往下移。
5. 流式期间搜索退化为普通子串匹配；MiniSearch 模糊索引在流结束后构建——每个快照都重建索引的代价高于下载本身。
6. 落地后的数据连同其身份（commit、`formatVersion`、生成时间）一起覆盖 IndexedDB 记录。
7. `cdn-config.ts` 按优先级尝试自定义 CDN、直连 GitHub 与默认 CDN；某个源中途失败即交给下一个并重头解析。
8. 广播出的身份信息经 client 快照到达主线程，「设置」页据此显示当前使用哪个快照、本次启动是复用本地缓存还是重新下载。TanStack Query 只缓存分页结果，注册表本身不在那里重复存一份。
9. 排序有一条规则和一处例外：浏览列表按工具栏的排序选择排列（默认按下载量，另一项是按名称）；只要 query 非空，worker 一律按相关度返回（名称命中 > 仓库 > 描述，安装量作为同分时的 tie-break），不受该选择影响。此时工具栏把排序下拉换成只读的「相关度」标签，避免控件声称一种结果列表并没有遵守的顺序。

**精选页**：

1. `featured-page` 请 worker 计算其数据，并在索引报告完成前保持骨架屏——基于不完整注册表的排名是错误的。
2. Hero 轮播由索引实时计算（`featured-rankings.ts`）：周安装量、历史总安装量、周增量占比；解析层将每个 skill 最近一周的安装量保留为 `weeklyInstalls`。
3. 分类区块将 `featured-content.ts` 中的人工策划引用与索引联结；解析不到的引用自动跳过，空分类整体隐藏。
