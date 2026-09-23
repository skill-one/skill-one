# 架构说明

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

## 概览

Skill One 是一个 Tauri v2 桌面应用，前端（React）负责渲染与数据读取，后端（Rust）负责所有会修改本地文件系统的操作。

```
┌─────────────────────────────────────────────────────────┐
│                     React 前端 (WebView)                  │
│  components / hooks / lib                               │
│   ├── 读取: lib/registry/, skill-*-api.ts                │
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

- **`src/lib/registry/`**：把注册表当作一个服务来访问——`client.ts` 是 `worker.ts` 在主线程的代理，`index-stream.ts` 先探测已发布快照再流式拉取并解析 `skills.jsonl`（逐行解析，下载进行中即可逐步拿到 skill），`worker-controller.ts` 应答分组浏览、搜索与元数据查询，`cache.ts` 持久化解析结果。调用方经由它完成过滤与分组，自身不持有全量注册表。
- **`src/lib/search-index.ts`**：整个商店唯一的搜索入口——基于 MiniSearch，对技能名称建索引，技能注册表与已安装技能列表共用。它定义了什么算命中（见「浏览技能列表」第 9 条），直接用 MiniSearch 自带的分词；`src/lib/search-skills.ts` 在它之上叠加注册表自己的排序（名称分层、安装量）。仓库与描述都不是搜索字段。注册表的大索引在 worker 里构建，条目很少的页面级列表在 `useMemo` 里构建。
- **`src/lib/skill-detail-api.ts`**：按需拉取单个 skill 的 `SKILL.md`，解析 frontmatter 与正文。
- **`src/lib/cdn-config.ts`**：管理下载源。默认直连 `raw.githubusercontent.com`，失败后回退到 CDN 镜像（`cdn.jsdmirror.com`），并支持用户在「设置」中配置自定义 CDN。候选地址按优先级依次尝试——包括响应体中途失败时——配置持久化到 localStorage。

读取数据通过 TanStack Query 缓存（`staleTime` 10 分钟、`gcTime` 无限），重启后可先从缓存渲染再后台刷新。每个候选请求带 10 秒超时，仅守护响应头；流式响应体另有分块间的停滞超时（数 MB 的下载本就可能超过任何固定上限）。注册表索引还有两层专属持久化，都在 worker 内部：IndexedDB 里的解析结果，以及它所定址的标签（见「浏览 skill 列表」）；两者合起来让一次启动在「上游没有新发布」时完全跳过下载。已安装列表、agent 状态等小体量查询由 TanStack Query 落盘；解析后的索引体积远超 WebView localStorage 配额，刻意排除在外。

### 后端（写入）

- **`src-tauri/src/skills.rs`**：暴露 8 个 Tauri 命令（`install_skill`、`list_installed_skills`、`remove_skills`、`set_skills_enabled`、`link_agents`、`link_status`、`read_skill_md`、`compute_skill_hash`），全部经由共享的 `spawn_blocking` 辅助函数把阻塞操作（GitHub 下载、install、link、哈希计算等）移出异步运行时。
- 命令内部委托给 `agents-skills` 库的 `Manager` 门面，返回 camelCase 的 DTO 给前端。自 agents-skills 0.15 起链接是单向的：agent 自带的 skills 被收编进规范目录（同名冲突保留规范目录副本），其余文件被隔离到 `.misc/<agent>/`，取消链接只断开符号链接。`list` 还会报告每个技能的描述与安装时间，应用原样透传。自 0.21 起一次安装就是一个 source 对应一个技能——`owner/repo@<skill>`，经 GitHub API 解析，只下载匹配到的技能目录——失败即命令的 `Err`，因此 `install_skill` 只返回 `{ skill, skipped }`。

### 前端写入封装

- **`src/lib/skills-manager.ts`**：对 Tauri 命令的类型化封装（`invoke`）。
- **`src/lib/local-skills.ts`**：面向 UI 的数据访问层，统一处理「Tauri 后端 / 浏览器 mock」两套实现，对组件透明。

### 浏览器兜底

当应用不在 Tauri 环境（如 `pnpm dev` 或 Vitest 测试）时，`isTauri()` 返回 `false`，`local-skills.ts` 会回退到 `mock-local.ts` 的内存数据，使 UI 与交互流程无需原生环境即可完整预览。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 路由、布局、TanStack Query Provider 与缓存持久化 |
| `src/components/app-header.tsx` | 应用外壳，只有一行：品牌居中于窗口中线（原生标题的位置），行首是当前列表的搜索框、行尾是单位切换——同时承担窗口拖拽区，这正是 overlay 标题栏留给应用的活。列表里的一页没有这些控件，因此那一行只剩品牌 |
| `src/components/drill-down-head.tsx` | 列表里的一页自己的头行：回到该列表的返回控件、实体的头像与名称、页面陈述的数字、以及它唯一的动作——同处一行、位于滚动容器之上，页面滚动时它的主体与出口都留在屏幕上。仓库会填上头像与动作，本地安装池两者皆无 |
| `src/components/app-rail.tsx` | 应用导航：72px 窄轨，内含两个入口与设置入口 |
| `src/components/list-toolbar.tsx` | 两个列表共用的两个控件，位于顶栏第一行：读者在找什么（商店在索引就绪前锁定输入），以及列表以什么单位呈现。它绑定的是共享视图而非某个页面，这才使两页上的控件是同一套 |
| `src/components/list-facets.tsx` | 当前列表的分类 chips，作为该列表内容区的首行：能放几个放几个，其余收进「更多」浮层 |
| `src/lib/list-view.ts` | 这些控件背后的共享视图：两页共用一个查询，各列表另有自己的单位与范围 |
| `src/lib/facet-overflow.ts` | 顶栏一行能放几个 chip——对测量宽度的纯算术 |
| `src/pages/explore/repo-card.tsx` / `repo-page.tsx` | 商店的仓库视图：一个仓库一张卡——主体是按安装量排序、有上限的 skill 列表，底部一行同时署名该仓库并通往它的页面——以及该仓库自己的页面：只讲一个仓库，别的什么都不放。页面按「打开它的那份列表」来读：商店的读法不限量地列出该仓库发布的全部 skill；已安装列表的读法先列出磁盘上已有的那些，其余目录放在列表底部一个控件之后 |
| `src/lib/view-memory.ts` / `src/hooks/use-view-memory.ts` / `use-return.ts` | 列表页自己的视图——它上面的控件、已展开的深度、滚动位置——按历史记录逐条记住：页面自带滚动容器，浏览器对它什么都不会恢复。`use-return.ts` 是应用统一的返回控件：它弹回那条记录，而不是往栈里再压一份列表——这正是上面那份记忆有意义的前提 |
| `src/lib/avatar-source.ts` | 「owner 头像在哪里」的唯一答案：数据集镜像（定址到已记录的快照标签）、它的可变分支、最后是 GitHub 自己的端点——所有界面都从这一条链取图 |
| `src/lib/tauri.ts` | 判断是否运行在 Tauri WebView 中 |
| `src/lib/open-external.ts` | 在系统浏览器中打开外链（Tauri 需 opener 插件） |
| `src-tauri/tauri.conf.json` | 窗口、构建与打包配置 |
| `src-tauri/capabilities/default.json` | 主窗口权限声明（`core:default`、`opener:default`、`updater:default`、`process:allow-restart`，以及 `http:default` 允许的 skills.sh 搜索来源） |

## 数据流示例

**安装一个 skill**：

1. 用户在探索页点击「安装」。
2. `local-skills.installSkillFromSource(repo, name)` 判断环境，并拼出 source `owner/repo@<skill>`。
3. Tauri 环境 → `skills-manager.installSkill` → `invoke("install_skill", ...)` → Rust `install_skill` 命令 → `agents-skills::Manager.add`（GitHub API 只下载匹配到的技能目录）。
4. 完成后前端刷新 `installed-skills` 查询缓存。
5. 浏览器环境 → 写入 `mock-local.installMockSkill`。

**探索技能列表**：

1. 注册表跑在按需创建的 worker 里（`lib/registry/client.ts` 是 `lib/registry/worker.ts` 的主线程代理）：主线程只接收分组结果、有上限的搜索回复与进度事件，从不持有那几 MB 的索引。
2. 启动时 worker 先从 IndexedDB 读取解析结果（`lib/registry/cache.ts`）并立即用于渲染——冷启动不等网络。
3. 随后读取 `latest` 指针拿到已发布的标签，并探测 `upstream/stats.json` 取得运行时间戳；两者都带打散缓存的时间戳，避免任何缓存副本把旧快照冒充成当前版本。时间戳与缓存一致时：**完全跳过多 MB 的正文下载**。
4. 否则 `registry/index-stream.ts` 拉取**定址到该标签** 的 `skills.jsonl`（不可变，镜像里的副本必然是正确字节），每收到一行就解析一行；页面直接用部分数据渲染。按注册表顺序时部分列表始终是完整列表的前缀，因此翻页稳定、仅总数不断上涨；但列表按安装量排序，首页是「当前最好的一批」，随着数据继续到达，早先的行的会往下移。
5. 搜索要等整个数据集就绪：MiniSearch 索引（由 `lib/search-index.ts` 构建，见第 9 条）在流结束后一次性构建（每个快照都重建的代价高于下载本身），在 worker 报告 `ready` 之前搜索框保持禁用。因此任何查询都不会基于不完整的注册表作答——索引存在之前 worker 一律返回空，作为禁用态字段的兜底。
6. 落地后的数据连同其身份（标签、运行时间戳）一起覆盖 IndexedDB 记录。
7. `cdn-config.ts` 按优先级尝试自定义 CDN、直连 GitHub 与默认 CDN；某个源中途失败即交给下一个并重头解析。
8. 广播出的身份信息经 client 快照到达主线程，「设置」页据此显示当前使用哪个快照、本次启动是复用本地缓存还是重新下载。TanStack Query 只缓存页面问出来的那些结果（分组答案、搜索回复），注册表本身不在那里重复存一份。
9. 排序有一条规则和一处例外：浏览列表只有一种形态——一个仓库一张卡、按 star 数降序排列，卡内 skill 按浏览顺序排列；而只要 query 非空，worker 一律按相关度返回。一次搜索重新作答的是列表的顺序、而不是它的布局，页面上也没有任何控件会声称相反的顺序。下面这套排序是注册表特有的。这个顺序是：查询的每个词都必须命中，不再退化为「命中任意一个词」；名称精确命中或前缀命中排在最前，它们之间按安装量排——名称命中已经确定了「这是什么」，同名之间安装量才是真正有意义的差别；其余是「含有查询词但不以它开头」的名称命中，先按安装量、再以 BM25 分数作为最后的平手判定。

什么算命中只有一处定义，在 `lib/search-index.ts`，其余两个可搜索的列表（技能注册表、已安装技能）共用：每个查询词都必须与某个索引词完全相等，或等于它的开头，其余一概不放过——打错的词、单词中间的片段、以及只有别的文档才命中的词，都算不上。保留前缀匹配，是因为只输了一半的词是「没输完」而不是「输错」。分词直接用 MiniSearch 自带的实现（按空格与标点切、再转小写），这对唯一被索引的字段已经足够——技能名就是 ASCII slug。（列表行按命中词出现的位置高亮，所以出现在更长单词内部的命中词也会被标上。）
