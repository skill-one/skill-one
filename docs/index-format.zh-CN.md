# 注册表快照（skills.jsonl）

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

商店内容来自 [skill-one/skills-profiles](https://github.com/skill-one/skills-profiles)——它覆盖 [skills.sh](https://www.skills.sh) 上全部 GitHub 来源技能，并为每个技能生成分类。快照以一整个目录的形式发布在 `dist` 分支：`skills.jsonl` 目录（每行一个技能），`skills/` 目录存放每个技能自己的 `SKILL.md` 和为它撰写的中文页，`repos.jsonl` 侧表（每个 GitHub 仓库一行），以及 `owners/` 目录存放各所有者的头像。

## 格式

每行一个 JSON 对象，按安装量降序排列：

```json
{
  "id": "vercel-labs/skills/find-skills",
  "name": "find-skills",
  "installs": 3630988,
  "dir": "vercel-labs/skills/find-skills",
  "description": "Helps users discover and install agent skills …",
  "description_zh": "帮助用户发现和安装 agent skills …",
  "domain": "development",
  "confidence": 0.8
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 规范的 skills.sh id：`{owner}/{repo}/{slug}`，按镜像的拼写方式。多段 slug 以去除斜杠的方式键入，因此 id 恒为三段。 |
| `name` | `string \| null` | 该技能 frontmatter 的 `name`，按镜像的拼写方式。 |
| `installs` | `number` | skills.sh 记录的总安装量 |
| `dir` | `string \| null` | 技能文件所在的目录，相对 `skills/`——以该行自己的 `owner/repo` 开头，拼写可能与 id 不同。仓库尚未被抓取时为 null。 |
| `description` | `string \| null` | 来自 SKILL.md frontmatter（缺失时为空） |
| `description_zh` | `string \| null` | `description` 的中文翻译。中文模式下应用优先使用它，缺失或空白时回落到 `description`。 |
| `domain` | `string \| null` | 分类：13 个封闭英文类别之一（`development`、`data-analysis`、……、`other`）。生成器尚未处理的技能为 null。[data/domains.ts](../src/data/domains.ts) 将键映射为展示标签与彩色 emoji。 |
| `confidence` | `number \| null` | 分类器自己对这次判断把握的读数（0–1）；它没有说时为 null——发布出来用于排序，而非当作标签正确的概率。 |

分类随目录行一起发布，因此解析一行即得到完整装饰的技能——不存在第二步合并来源。应用在模型中把上游键保存为单元素列表，分组与筛选即可按成员关系匹配。

*缺失*的分类是第三种状态，不是其他：枚举中的 `other` 是数据集"以上都不贴合"的回答，而生成器从未触及的技能根本没有回答。应用将两者区分开——其他佩戴杂物箱 📦，未回答者佩戴问号 ❓（未分类）——筛选栏也为两者各保留一枚 chip，让承诺"其他"的范围永远不会悄悄混入没人看过的技能。

GitHub 星数**不**随技能行发布：它们存放在下文的 `repos.jsonl` 侧表中，在解析时联接进来。

## 仓库元数据（repos.jsonl）

每行一个 JSON 对象，每个 GitHub 仓库一行：

```json
{"id": "vercel-labs/skills", "owner": "vercel-labs", "repo": "skills", "description": "The open agent skills tool - npx skills", "stars": 32793, "updated_at": "2026-09-30T01:48:12Z", "pushed_at": "2026-09-28T20:20:57Z", "html_url": "https://github.com/vercel-labs/skills", "gone": false, "fetched_at": "2026-09-30T01:50:01Z"}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | `{owner}/{repo}`——每个索引 id 的前两段，即联接键 |
| `owner` / `repo` | `string` | 联接键的拆分形式。 |
| `stars` | `number \| null` | 该仓库的 GitHub star 数；仓库消失时为 `null`（应用归一化为 0） |
| `description` | `string \| null` | 仓库的 GitHub About 文本。应用未使用：技能描述来自 SKILL.md frontmatter。 |
| `updated_at` / `pushed_at` / `fetched_at` | `string \| null` | 仓库时间戳。追踪的是**仓库**，不是技能。应用未使用。 |
| `html_url` | `string \| null` | 仓库的 GitHub 页面。应用未使用。 |
| `gone` | `boolean` | GitHub 对该仓库没有答案（已改名或删除）。应用把其 null 星数归一化为 0。 |

## 所有者头像（owners/）

数据集把每个所有者的 GitHub 头像作为普通文件复制进快照，固定路径 `owners/{owner}.png`（无论实际编码如何一律 `.png` 扩展名——图像解码器自行嗅探字节）。因此头像与 SKILL.md、索引走同一下载源与 CDN 回退链，取自快照的 `dist` 分支。GitHub 自身的头像端点（`github.com/{owner}.png`）留在链尾，作为数据集漏拷的所有者的回退（一次失败的运行会留下空洞直到下一次）；所有者首字母是最后兜底。

## 技能目录（skills/）

索引行与 `skills/` 目录按该行的 `dir` 联接：`skills/<dir>/` 存放该技能自己的 `SKILL.md`、数据集的类型化答案（`domain.json`）以及中文页 `SKILL.zh.md`。应用只读索引行，从不抓取 `domain.json`。技能没有封面插图：详情抽屉的图片位置显示作者首字母（见 [src/components/skill-cover.tsx](../src/components/skill-cover.tsx)）。卡片列表则完全不显示图片——每行重复一个字母方块只是 48px 承载不了任何事实的装饰——所以每张卡以技能名领头，来源以文字写在卡片栏上。

应用把每行映射到 `Skill` 模型：`name = id 的 slug`、`id = 该行的 id`、`repo = {owner}/{repo}`、`path = skills/<dir>`（快照内目录，用于详情抓取与 basename 匹配）、`url = https://www.skills.sh/{id}`（推导得出）、`descriptionZh = description_zh`、`profile = { domain: [domain], confidence }`——`stars` 由联接的 `repos.jsonl` 行提供（未联接时为 0）。name 仍是 slug 而非该行的 frontmatter `name`：slug 是所有消费方共享的唯一 skills.sh 身份——本地安装副本叫这个名字（agents-skills 按 slugify 后的 frontmatter `name` 匹配安装）、skills.sh 实时搜索回报的也是它。但原始拼写不再被丢弃：当 frontmatter `name` 经 slug 化后与 slug 不同时，该行会以 `displayName` 携带它，界面用它渲染技能标题；`id` 本身也随行携带，安装时原样发给后端，不再由 repo 与 slug 重新拼接。快照不再发布每技能的内容哈希或首次抓取时间，模型因此不再携带 `rev`/`firstSeenAt`。

详情抽屉把分类显示为领域 chip，并在"源"提示中给出 SKILL.md 的确切路径。

## 消费快照

实现在 [src/lib/registry/](../src/lib/registry/)（worker + 主线程代理），由商店各页面消费。

### etag 探测

上游不发布指针文件，也没有每次运行的统计侧表：关于"当前是什么"的唯一陈述就是 `dist` 分支本身。因此版本解析是**仅 etag**：对分支的 `skills.jsonl` 发起一次带缓存击穿戳的 `HEAD`（走与其他抓取相同的候选链），应答给出正文的 etag——内容哈希，etags 相等即索引字节相等，这正是"未变化"短路所比较的新鲜度身份。正文带 `Last-Modified` 戳时一并读出，设置页因此仍能说明快照的发布时间。GitHub 的 API 被刻意弃用：匿名 API 请求受每 IP 限流约束，是数据层中唯一可能因应用无法控制的原因而被拒绝的调用。`HEAD` 不传正文，探测多兆字节的文件只花头部的代价。

### 抓取策略

- 快照以可变的 `dist` 分支寻址——这是上游发布的唯一地址——且每一次快照抓取（探测、正文、侧表）都携带**缓存击穿戳**：没有提交 SHA 可钉定时，一天前的边缘副本与当前索引无从区分。
- 解析结果连同其身份（etag + `Last-Modified`）持久化到 IndexedDB。下次启动先立即提供缓存，再将探测到的 etag 与存储的比较：相等则多兆字节的正文完全不必下载。
- 应用保持打开期间会重复探测：每小时 tick 会在上次完成的检查超过 12 小时后重跑一次（数据集每日发布），休眠恢复可见时也会重新询问窗口。什么都不问用户——刷新原位换入新快照而不清空 UI，失败或无事的检查绝不打扰——但真正落地新快照的检查会顺带告知一声，让脚下变化的列表不至于像故障。服务身份上的 `checkedAt` 戳记录检查日期，也就是窗口的起算点，且只有真正应答的探测才会写入，于是够不着的源就在下个 tick 重试。注意：读不到 etag 的周期性检查**绝不**回落到正文抓取——与启动和强制重载不同——探测够不着时被服务的数据原样保留，而不是凭猜测拉取整个索引。
- [index-stream.ts](../src/lib/registry/index-stream.ts) 的 `INDEX_SPEC` 持有 `repo` / `path: "skills.jsonl"` / `ref: "dist"`，侧表相对其寻址：`repos.jsonl`。
- 解析后，非规范 GitHub id（三段、所有者不含点）的行被过滤掉，其余每行映射到 `Skill` 模型。
- 下载是流式的：响应体逐行解码，每行到齐即解析，UI 无需等待整个 ~8MB 文件。进度至多每 400ms 推送一次，某来源中途失败时活动缓冲会回卷、下一候选从头重启该文件——因此播报的计数是单调的。
- `repos.jsonl`（GitHub 星数联接表，上文）与正文并行发起，让它的延迟藏进多兆字节的下载里；解析出的行在解析时联接进每条技能行。它是装饰品：够不着或缺失的侧表只会让技能 0 星，而不是让下载失败。"未变化"短路会整个跳过它——缓存的技能已带着星数。失败的联接也绝不持久化：冷启动缓存只在侧表应答后写入（空 map 算应答，null 不算），星数缺失的会话不会带进下一次；下次启动重新下载并重试联接。

### UI

- 探索页在流式下载进行中渐进渲染：下载完成前计数显示"N · 加载中"。
- 需要完整注册表的页面（已安装页的元数据联接）以完成为门槛，流结束前保持骨架——部分数据会解析出错误的技能。
- 设置报告正在服务的快照（其 etag、发布时间、行数）以及本次启动是下载还是复用了本地副本。它还记录最近一次完成检查的时间（`checkedAt`），即自动窗口的起算点。检测更新按需运行同一廉价检查（无视新鲜度窗口），报告是否有新内容落地；立即重新下载在快照未动时也强制重下。

技能的 `SKILL.md` 从快照 `dist` 分支的 `skills/<dir>/SKILL.md` 抓取；见 [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts)。CDN 边缘副本可能短暂落后于最新发布——对 SKILL.md 正文而言至多落后一个每日发布周期。

快照还为一部分技能发布中文页 `skills/<dir>/SKILL.zh.md`（索引行没有任何标记；文件存在与否是唯一信号）。中文模式下详情抽屉以该页领起正文，只有当读者通过头部的查看原文开关把抽屉翻回原文时才抓取英文 `SKILL.md`（描述与正文共用一个开关）——对未翻译的技能则直接以英文正文呈现（磁盘读取只读英文文件）。中文页的抓取与 repos 侧表一样是装饰品：缺页、网络失败或服务器错误都把正文交回英文原版。

所有者头像（技能卡元数据栏上的作者 chip，以及详情抽屉仓库行上的所有者头像）从快照的 `owners/{owner}.png` 经同一下载源链抓取；见 [src/components/owner-avatar.tsx](../src/components/owner-avatar.tsx)。头像仅是装饰：抽屉仓库行与卡片栏都在旁边以文字印出仓库名，chip 的悬停卡（见 [src/components/repo-hover-card.tsx](../src/components/repo-hover-card.tsx)）在其后补充星数——因此头像对辅助技术隐藏。
