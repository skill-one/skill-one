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
- **`src/lib/search-index.ts`**：整个商店唯一的搜索入口——基于 MiniSearch，对技能名称建索引，技能注册表与已安装技能列表共用。它定义了什么算命中（见「浏览技能列表」第 9 条），直接用 MiniSearch 自带的分词；`src/lib/search-skills.ts` 在它之上叠加注册表自己的排序（名称分层、热度）。仓库与描述都不是搜索字段。注册表的大索引在 worker 里构建，条目很少的页面级列表在 `useMemo` 里构建。
- **`src/lib/skill-detail-api.ts`**：按需拉取单个 skill 的 `SKILL.md`，解析 frontmatter 与正文；同时拉取快照可选的中文页面（`skills/<dir>/SKILL.zh.md`），中文模式下详情正文以它为主——此时英文 `SKILL.md` 只在读者通过头部的「查看原文」开关把整个抽屉切回原文（或该 skill 没有翻译）时才拉取。
- **`src/lib/cdn-config.ts`**：管理下载源。默认直连 `raw.githubusercontent.com`，失败后回退到 CDN 镜像（`cdn.jsdmirror.com`），并支持用户在「设置」中配置自定义 CDN。候选地址按优先级依次尝试——包括响应体中途失败时——配置持久化到 localStorage。

读取数据通过 TanStack Query 缓存（`staleTime` 10 分钟、`gcTime` 无限），重启后可先从缓存渲染再后台刷新。每个候选请求带 10 秒超时，仅守护响应头；流式响应体另有分块间的停滞超时（数 MB 的下载本就可能超过任何固定上限）。注册表索引还有两层专属持久化，都在 worker 内部：IndexedDB 里的解析结果，以及服务它的快照 etag（见「浏览 skill 列表」）；两者合起来让一次启动在「上游没有新发布」时完全跳过下载。已安装列表、agent 状态等小体量查询由 TanStack Query 落盘；解析后的索引体积远超 WebView localStorage 配额，刻意排除在外。

### 后端（写入）

- **`src-tauri/src/skills.rs`**：暴露 10 个 Tauri 命令（`install_skill`、`list_installed_skills`、`remove_skills`、`set_skills_enabled`、`link_agents`、`link_status`、`read_skill_md`、`analyze_skill`、`skill_fingerprint`），全部经由共享的 `spawn_blocking` 辅助函数把阻塞操作（GitHub 下载、install、link、哈希计算等）移出异步运行时。
- 命令内部委托给 `agents-skills` 库的 `Manager` 门面，返回 camelCase 的 DTO 给前端。自 agents-skills 0.15 起链接是单向的：agent 自带的 skills 被收编进规范目录（同名冲突保留规范目录副本），其余文件被隔离到 `.misc/<agent>/`，取消链接只断开符号链接。`list` 还会报告每个技能的描述与安装时间，应用原样透传。自 0.21 起一次安装就是一个 source 对应一个技能——0.26 起 source 为 id `owner/repo/slug`；后端从 codeload.github.com 下载整个仓库 tarball 并在本地匹配技能（不再走 GitHub REST API，也不受其匿名限流影响）——失败即命令的 `Err`，因此 `install_skill` 只返回 `{ skill, skipped }`。
- **`src-tauri/src/skill_hash.rs`**：技能目录的内容身份——skills.sh 上游哈希 + 仅 stat 的变更检测指纹，由同一次递归遍历产出（见 `docs/skill-provenance.zh-CN.md`）。`analyze_skill` 一次返回两者；`skill_fingerprint` 是其中仅 stat 的那一半，即让账本跨重启复用已存哈希的廉价有效性检查。
- **`src-tauri/src/provenance.rs`**：来源账本 `~/.agents/skills/.skill-one.jsonl` 的两个固定路径文件命令（`read_provenance`/`write_provenance`）——原子写入，且在旧版 JSON 文档被首次 JSONL 写入转换并移除之前，透明地读取它。全部 schema 知识都在前端（`src/lib/provenance.ts`）。
- **`src-tauri/src/activity.rs`**：位于 `<app_log_dir>/activity.jsonl` 的 append-only 活动日志——`append_activity`（2 MiB 时轮转）、`read_activity`（跨当前文件与备份读取最新的 `limit` 行）、`clear_activity` 与 `open_activity_dir`。与 `provenance.rs` 一样保持“薄”：schema 与发现基线都在前端（`src/lib/activity.ts`，见 `docs/activity-log.md`）。

### 前端写入封装

- **`src/lib/skills-manager.ts`**：对 Tauri 命令的类型化封装（`invoke`）。
- **`src/lib/local-skills.ts`**：面向 UI 的数据访问层，统一处理「Tauri 后端 / 浏览器 mock」两套实现，对组件透明。

### 浏览器兜底

当应用不在 Tauri 环境（如 `pnpm dev` 或 Vitest 测试）时，`isTauri()` 返回 `false`，`local-skills.ts` 会回退到 `mock-local.ts` 的内存数据，使 UI 与交互流程无需原生环境即可完整预览。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 路由、布局、TanStack Query Provider 与缓存持久化 |
| `src/components/app-header.tsx` | 应用外壳，只有一行：行首是双入口分段导航，品牌居中浮在这一行之上，行尾是设置入口——同时承担窗口拖拽区，这正是 overlay 标题栏留给应用的活。商标脱离文档流、按 header 自身的盒子居中，因为红绿灯让行首的内边距是行尾的两倍。外壳只留窗口自己的控件，列表的控件（搜索框也在其中）站到列表那一行去 |
| `src/components/app-nav.tsx` | 应用导航：三个入口做成 header 里的一个分段控件（在整个路由家族内保持高亮，包括下钻页）。用链接而不是标签页：它们是带历史的「去处」，所以高亮说的是 `aria-current="page"`；tablist 会去声称并不存在的面板 |
| `src/components/segmented.ts` | 全应用唯一一份分段控件外观，header 入口导航与列表形态开关共用：灰底轨道上，被选中的那一半以表面色加一道极轻的阴影凸起。它取自 shadcn 自己的 `Tabs` default variant，但只作为**配方**而不是 `Tabs` 组件——两个调用方一个是链接、一个是开关，都不是标签组，所以共享的只有外观，行为与无障碍仍归各自的原语。为了让这两个控件与身旁的东西等高，配方相对 tabs 改了两处（28px 的一半放进 3px 内边距的轨道会长到 34px，比旁边的 `h-8` 搜索框还高）：轨道内边距 2px，两半之间留 2px 间隙 |
| `src/components/list-toolbar.tsx` | 列表内容区的第一行，也是答案之上的唯一一行，并独自决定四个控件如何排列：**分成两组**——行首是搜索框（取组件库自己的 `max-w-sm` 尺寸）紧贴形态开关；范围与排序由 `ml-auto` 推到行尾，因为各工具都把「读答案的控件」放在那里（MUI 的密度与列设置、Ant Design Pro 的 密度/列设置、Airtable 的排序与视图选项）。这个划分来自「搜索进行时各控件会怎样」：搜索框与形态仍参与搜索的答案，所以领头；范围与排序是搜索会接管的两个，所以并肩站在最右。形态是一对常驻的分段按钮而不是菜单，因为它只有两个答案，且两个都能同时站在行上。搜索进行时，范围与排序原地锁定而不是卸载：否则一行在第一个按键后就把搜索框从读者光标下挪走；形态不参与锁定，因为搜索的答案分段落呈现，且沿读者选定的形态阅读。只有一种排序的列表根本不显示排序控件。搜索框在注册表索引建好前保持锁定，且只对商店如此——已安装列表本就在内存里 |
| `src/components/list-facets.tsx` | 当前列表的分类选择器，一个下拉菜单，与排序切换同处该列表内容区首行：触发按钮陈述当前范围，菜单列出「全部」及列表持有的每个分类，各带计数 |
| `src/lib/list-view.ts` | 这些控件背后的共享视图：各列表自己的查询、范围、排序与形态——排序与形态又是两个答案，各按自己的键持久化，而查询与范围只留在本次会话。每个列表各自持有自己的问题，因为同一个问题在两处的答案是两回事（注册表索引 vs. 本机记录），一个列表的问题不会顺带重新回答另一个 |
| `src/lib/enabled-split.ts` | 已安装技能列表的顺序里唯一不由读者决定的那一条：把已排序的行**稳定地**切成「启用」与「停用」两半，两半各自保持到达时的顺序。启用状态不是第四种排序，而是所选排序的一次划分，所以它在排序**之后**施加，而不是折进每个比较器里——这正是它对列表提供的每一种排序、以及以后新增的排序都成立的原因，而不只是对那些有人记得包一层比较器的排序成立。已安装页对同一个判定函数跑两次：对已渲染的行跑，用来画出两个分组；对整份答案跑，让详情抽屉的 ←/→ 走的是读者看到的顺序，而不是排序的原始顺序 |
| `src/pages/explore/repo-card.tsx` | 一个仓库一张卡——主体是按安装量排序、有上限的 skill 预览，头部一行：左侧是身份信息，右侧是展开标记（上限截住了行时为「＋ N」，展开后为「− N 个 skill」，本就放得下的卡片什么都不显示）。点击头部即可原地展开：卡片占满整个网格行，展开的行以两列均衡排布，整个重排作为一次 motion layout 过渡运行（过渡中的卡片浮于邻居之上；开启「减弱动态效果」的用户直接切换）。搜索时上限不隐藏任何行——每条命中都在屏上、没有切换按钮——上限改为度量「大」：skill 数超过读者预览设置的卡片自行采用这份展开版式（占满整行、两列主体） |
| `src/pages/explore/search-results.tsx` | 搜索答案，搜索进行时由两个可搜索列表渲染，形态是**一个来源一段、全部默认展开**（`CollapsibleSection`）：名称说明行来自哪个来源，计数说明它有多少，折叠让只想看某一个来源的读者把其余两段收起来。各段按可信度与成本排序：1) **本列表自己的来源**（商店是注册表索引，已安装是本机磁盘记录），2) **注册表索引**回答已安装的搜索，3) **skills.sh 实时目录**，两个界面都有。没有任何一段藏在「按下」后面：搜索已经让读者付出了一次查询，也就等于告诉我们他要的是完整答案，于是 skills.sh——唯一的跨网请求，由端点两字符下限与 5 分钟缓存兜底——随查询落定自动请求，在途时该段以当前单位的骨架屏占位。答空的来源什么都不渲染（缺席比 0 更安静），仍在作答的来源则在屏上，好让它的「没有」是一个结论而不是一个空缺。**唯一的例外是发起搜索的那个列表自己的来源**：它会在本该属于自己的分组位置留一行安静的话（`noIndexMatch` / `noInstalledMatch`）。三段分组里有一段专属于*这个*列表，并不等于三个平等来源——读者搜的是「已安装」，若在一堆没有「已安装」标题的行里扫过，他会把它们读成已安装项，直到抬头看见另一个来源的名字为止，所以作用域的切换必须被说出来，而不是指望读者自己注意到。 这一行在答案列里**居中**，来源自己的图标与它同行，因此仍然点明它说的是哪个来源，读起来是一条提示而不是一个标题——一行被丢在宽列左边界的句子，会读成漂到页面上的碎片。整屏的 `Placeholder` 是另一个居中的空态，两者的区别在于**各自声称什么**而非**坐在哪里**：这一行点明一个来源，那一个点明全部来源。这一行会让位给**空态——整次搜索的结论**（`noMatch` / `noSourceMatch`），空态只有在全部来源都答空之后才开口：一屏结果上方写「未找到匹配」是关于页面自身内容的谎言，而同一个事实不需要说两遍。商店的 live 段与注册表的行按身份去重。详情抽屉走打开技能所在的那份答案、穿着那份答案的表面，所以选中要按「答案 + 身份」寻址 |
| `src/components/collapsible-section.tsx` | 搜索答案里每一段来源所穿的外壳，也是已安装列表中启用行之下那组「已禁用」技能所穿的外壳：一行由折叠箭头、来源图标、标题和计数徽标组成，分段内容滚过时钉在顶部，点击整行即可折叠/展开。折叠后计数仍留在头上；状态为非受控，因为答案每次变化都会整体重挂载列表 |
| `src/pages/explore/live-groups.ts` | skills.sh 实时搜索结果按仓库重新归组，供搜索视图的仓库视图使用：把去重后的命中按 `owner/repo` 分桶——桶保持端点自己的相关度顺序，桶内 skill 按安装量降序。列表的排序决定 live 段由什么构成：这里是仓库卡片（与所有搜索卡片一样不截断——卡片就是完整的 live 答案），技能视图则是一行一个 skill 的扁平列表。live 卡片的底栏只是标签——行（点击打开 skills.sh）是唯一的出路 |
| `src/lib/view-memory.ts` / `src/hooks/use-view-memory.ts` | 列表页自己的视图——它上面的控件、已展开的深度、滚动位置——按历史记录逐条记住：页面自带滚动容器，浏览器对它什么都不会恢复 |
| `src/lib/avatar-source.ts` | 「owner 头像在哪里」的唯一答案：数据集镜像的 `dist` 分支（经下载源链）、最后是 GitHub 自己的端点——所有界面都从这一条链取图 |
| `src/lib/tauri.ts` | 判断是否运行在 Tauri WebView 中 |
| `src/lib/open-external.ts` | 在系统浏览器中打开外链（Tauri 需 opener 插件） |
| `src/lib/activity.ts` / `src/components/activity-dialog.tsx` | append-only 活动日志——应用对用户技能与 Agent 做过什么——及其查看器，从设置 popover 进入（见 `docs/activity-log.md`） |
| `src-tauri/tauri.conf.json` | 窗口、构建与打包配置 |
| `src-tauri/capabilities/default.json` | 主窗口权限声明（`core:default`、`opener:default`、`updater:default`、`process:allow-restart`，以及 `http:default` 允许的 skills.sh 搜索来源） |

## 数据流示例

**安装一个 skill**：

1. 用户在探索页点击「安装」。
2. `local-skills.installSkillFromSource(skill)` 判断环境，并把该行自带的上游 id `owner/repo/slug` 原样交给后端。
3. Tauri 环境 → `skills-manager.installSkill` → `invoke("install_skill", ...)` → Rust `install_skill` 命令 → `agents-skills::Manager.add`（从 codeload.github.com 下载整个仓库 tarball，在本地按 slug 匹配技能）。
4. 完成后前端刷新 `installed-skills` 查询缓存。
5. 浏览器环境 → 写入 `mock-local.installMockSkill`。

**探索技能列表**：

1. 注册表跑在按需创建的 worker 里（`lib/registry/client.ts` 是 `lib/registry/worker.ts` 的主线程代理）：主线程只接收分组结果、有上限的搜索回复与进度事件，从不持有那几 MB 的索引。
2. 启动时 worker 先从 IndexedDB 读取解析结果（`lib/registry/cache.ts`）并立即用于渲染——冷启动不等网络。
3. 随后以带缓存击穿的 `HEAD` 探测 `dist` 分支索引正文（只花头部代价——从不调用 GitHub 的 API），读出正文 etag 作为新鲜度身份，避免任何缓存副本把旧快照冒充成当前版本。etag 与缓存一致时：**完全跳过多 MB 的正文下载**。
4. 否则 `registry/index-stream.ts` 拉取可变 `dist` 分支上的 `skills.jsonl`（带击穿戳，边缘的滞后副本不会冒充当前索引），每收到一行就解析一行；页面直接用部分数据渲染。按注册表顺序时部分列表始终是完整列表的前缀，因此翻页稳定、仅总数不断上涨；但列表按热度（`src/lib/popularity.ts` 里安装量与 star 的合成指标）排序，首页是「当前最好的一批」，随着数据继续到达，早先的行的会往下移。
5. 搜索要等整个数据集就绪：MiniSearch 索引（由 `lib/search-index.ts` 构建，见第 9 条）在流结束后一次性构建（每个快照都重建的代价高于下载本身），在 worker 报告 `ready` 之前搜索框保持禁用。因此任何查询都不会基于不完整的注册表作答——索引存在之前 worker 一律返回空，作为禁用态字段的兜底。
6. 落地后的数据连同其身份（快照 etag、`Last-Modified` 时间）一起覆盖 IndexedDB 记录。
7. `cdn-config.ts` 按优先级尝试自定义 CDN、直连 GitHub 与默认 CDN；某个源中途失败即交给下一个并重头解析。
8. 广播出的身份信息经 client 快照到达主线程，「设置」页据此显示当前使用哪个快照、本次启动是复用本地缓存还是重新下载。TanStack Query 只缓存页面问出来的那些结果（分组答案、搜索回复），注册表本身不在那里重复存一份。
9. 排序有一条规则和一处例外：浏览列表只有一种形态——一个仓库一张卡、按 star 数降序排列，卡内 skill 按浏览顺序排列；而只要 query 非空，worker 一律按相关度返回。一次搜索重新作答的是列表的顺序、而不是它的布局，页面上也没有任何控件会声称相反的顺序。下面这套排序是注册表特有的。这个顺序是：查询的每个词都必须命中，不再退化为「命中任意一个词」；名称精确命中或前缀命中排在最前，它们之间按热度排——名称命中已经确定了「这是什么」，同名之间安装量与 star 的合成热度才是真正有意义的差别；其余是「含有查询词但不以它开头」的名称命中，先按热度、再以 BM25 分数作为最后的平手判定。
10. 仓库回答是一张平铺网格，按 `byRepoRank` 定义的排名排列——上面没有任何分组标题——渐进挂载为这张网格控制节奏：首页随页面挂载第一批，滚动到底部哨兵后挂载其余部分。

什么算命中只有一处定义，在 `lib/search-index.ts`，其余两个可搜索的列表（技能注册表、已安装技能）共用：每个查询词都必须与某个索引词完全相等，或等于它的开头，其余一概不放过——打错的词、单词中间的片段、以及只有别的文档才命中的词，都算不上。保留前缀匹配，是因为只输了一半的词是「没输完」而不是「输错」。分词直接用 MiniSearch 自带的实现（按空格与标点切、再转小写），这对唯一被索引的字段已经足够——技能名就是 ASCII slug。（列表行按命中词出现的位置高亮，所以出现在更长单词内部的命中词也会被标上。）
