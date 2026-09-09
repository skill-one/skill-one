# 注册表快照（skills.jsonl）

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

商店内容来自 [skill-one/skills-sh-mirror](https://github.com/skill-one/skills-sh-mirror)——对 [skills.sh](https://www.skills.sh) 上全部 GitHub 来源技能的每日镜像。快照发布在 `dist` 分支：`skills.jsonl` 每行一个技能，`skills/` 目录则存放每个技能的完整文件。

## 格式

每行一个 JSON 对象，按安装量降序排列：

```json
{
  "id": "vercel-labs/skills/find-skills",
  "installs": 3277534,
  "stars": 30501,
  "url": "https://www.skills.sh/vercel-labs/skills/find-skills",
  "description": "Helps users discover and install agent skills …",
  "hash": "b146008599c31057cef1c145774cea5d5afb30e8f43fa802e47a4b461419aaaf",
  "fetchedAt": "2026-09-06T07:57:37.803Z"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | skills.sh 规范 id：`{owner}/{repo}/{slug}`。含 `/` 的多段 slug 会去掉斜杠后作为键，因此 id 恒为三段。 |
| `installs` | `number` | skills.sh 记录的总安装量 |
| `stars` | `number \| null` | 源仓库的 GitHub star 数（仓库已删除时为 `null`，应用内归一为 0） |
| `url` | `string` | 技能在 skills.sh 的页面 |
| `description` | `string \| null` | 来自 SKILL.md frontmatter（缺失时为空） |
| `hash` | `string \| null` | 技能文件的 SHA-256。上游任何文件变化都会使其改变，即**快照所描述的那个版本**。 |
| `fetchedAt` | `string` | 抓取器首次取到当前内容版本的时间（ISO，UTC）：说的是*当前内容*发布了多久，不是技能最早何时出现 |

索引行与 `skills/` 目录按 id 一一对应：`skills/{owner}/{repo}/{slug}/` 内正是上游技能自带的全部文件。应用把每行映射为 `Skill` 模型：`name = slug`、`repo = {owner}/{repo}`、`path = skills/{id}`（镜像内目录，用于详情拉取与按目录名匹配）、`rev = hash`、`firstSeenAt = fetchedAt`。

技能详情抽屉将 `hash` 以「版本」呈现（`#b1460085`，完整值放 tooltip），`fetchedAt` 以「收录时间」呈现。作者自己在 frontmatter 写的 `version` 刻意不再并列展示：它是对另一件事的声明。

## 消费方式

实现位于 [../src/lib/registry/](../src/lib/registry/)（worker + 主线程代理），由商店各页面消费。

### `stats.json` 附属文件

快照的缓存能力全靠随行的运行统计承载：

| 字段 | 作用 |
| --- | --- |
| `finishedAt` | 标识快照：一次运行只发布一次，因此相同的值意味着相同的字节——「索引变了吗」由此变成一次字符串比较。它同时作为发布时间展示在「设置」页。 |
| `indexedRows` | 发布的行数；「设置」页中与本地实际加载数并列展示（后者可能更少：解析时有防御性过滤）。 |
| `startedAt`（日期部分） | 运行结束的 UTC 日期——与上游 CI 打标签所用日期一致。 |

### 拉取策略

- 先探测这个指针文件：走可配置下载源（见 [../src/lib/cdn-config.ts](../src/lib/cdn-config.ts)），并且**带打散缓存的时间戳**——一个负责报告新鲜度的可变文件绝不能从缓存里拿，否则旧快照会被当成当前版本。它只有约 300 B，打散几乎没有代价。
- 正文随后按推导出的 `dist-<date>` 标签拉取（`…/skills-sh-mirror@dist-2026-09-06/skills.jsonl`）。标签对单个快照不可变，因此不打散缓存，且镜像边缘的副本必然就是正确的字节。（同日重跑会强制把标签移到最新快照；变化了的 `finishedAt` 会察觉这一点并触发重下。）
- 若没有任何源给出可用的日期，则退回可变的 `dist` ref——此时必须打散缓存，因为没有定址锚点时，一份一天前的边缘副本与当前索引无从分辨。
- 解析结果连同其身份（`tag` + `finishedAt`）一起持久化到 IndexedDB。下次启动立即用该缓存渲染，再把探测到的时间戳与存储的比较：相同则**完全跳过多 MB 的正文下载**。
- [index-stream.ts](../src/lib/registry/index-stream.ts) 中的 `INDEX_SPEC` 固定 `repo` / `path: "skills.jsonl"` / `ref: "dist"`（上面的标签由每次下载注入）。
- 解析后过滤掉非规范 GitHub id（非三段、owner 含 `.`）的行，其余映射为 `Skill` 模型。
- 下载是流式的：响应体逐行解码，每凑齐一行就立即解析，界面不必等待整份约 5.7MB 的文件。进度最多每 400ms 推送一次；某个下载源中途失败、切换到下一个候选重新解析时活动缓冲区会被清空重头解析，因此推送出的计数是单调的，永远只增不减。
- `trending.json`（趋势视图 top-100 的 id 列表，按上游排名排序）与正文下载并行拉取；趋势榜与首页横幅按该顺序对注册表排名。列表缺失或不可达时只是隐藏该板块。

### 界面

- 探索页在流式下载期间渐进渲染（计数显示为「N · 加载中」），侧边栏「全部」的数字随下载推进持续增长。
- 依赖全量数据的页面——精选页的榜单排名与精选 join、「我的技能」的元数据 join——以「下载完成」为门控，在此之前保持骨架屏，因为部分数据会导致排名错误。
- 「设置」页报告当前服务的快照（`dist-<date>` 标签、发布时间、发布行数），以及本次启动是重新下载还是复用了本地缓存；其按钮会强制重下，即使快照没有变化。

技能详情 `SKILL.md` 从镜像快照按 `skills/{id}/SKILL.md` 拉取，见 [../src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts)。
