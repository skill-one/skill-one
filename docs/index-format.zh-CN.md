# 注册表索引（index.jsonl）

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

商店内容来自 [skill-one/skills-index](https://github.com/skill-one/skills-index) 发布的 `index.jsonl`（JSONL 格式，发布在 `dist` 分支，每行一个技能）。

## 格式

每行一个 JSON 对象：

```json
{
  "source": "vercel-labs/skills",
  "skillId": "find-skills",
  "installs": 3005209,
  "weeklyInstalls": [113781, 109199, 109085, 115475, 107969, 101120, 96861, 93130],
  "path": "skills/find-skills",
  "description": "Discover and install agent skills"
}
```

| 字段              | 类型       | 说明                                                        |
| ----------------- | ---------- | ----------------------------------------------------------- |
| `source`          | `string`   | 源仓库，`owner/repo` 形式                                   |
| `skillId`         | `string`   | 技能标识，同时作为技能名（无单独 `name` 字段）              |
| `installs`        | `number`   | 总安装量                                                    |
| `weeklyInstalls`  | `number[]` | 近几周安装量                                                |
| `path`            | `string`   | 技能在仓库内的相对目录（用于拼 `SKILL.md` 地址）            |
| `description`     | `string`   | 技能说明（可选，缺失时为空）                                |
| `stars`           | `number`   | 源仓库的 GitHub star 数（可选，缺失时归一为 0）             |

> `source` / `skillId` / `installs` / `weeklyInstalls` 来自 skills.sh；`path` / `description` 由仓库扫描得到。

## 消费方式

实现位于 [../src/lib/registry/](../src/lib/registry/)（worker + 主线程代理），由商店各页面消费。

### `index-meta.json` 附属文件

索引的缓存能力全靠它承载：

| 字段 | 作用 |
| --- | --- |
| `formatVersion` | 与缓存数据一并存储，格式变更时可被察觉。 |
| `generatedAt` | 在「设置」页展示该快照的发布时间。 |
| `counts.total` | 发布的条目总数；「设置」页中与本地实际加载数并列展示（后者更少：非 GitHub 来源会被过滤掉）。 |
| `distCommit` | 承载本次快照 `index.jsonl` 的 `dist` 分支 commit。下载定址到它，「索引变了吗」由此变成一次字符串比较。 |

### 拉取策略

- 先探测这个指针文件：走可配置下载源（见 [../src/lib/cdn-config.ts](../src/lib/cdn-config.ts)），并且**带打散缓存的时间戳**——一个负责报告新鲜度的可变文件绝不能从缓存里拿，否则旧 commit 会被当成当前版本。它只有约 300 B，打散几乎没有代价。
- 正文随后按 `distCommit` 拉取（`…/skills-index@<sha>/index.jsonl`，或 `raw.githubusercontent.com/…/<sha>/…`）。commit 定址的 URL 不可变，因此不打散缓存，且镜像边缘的副本必然就是正确的字节。
- 若没有任何源给出可用的 commit，则退回可变的 `dist` ref——此时必须打散缓存，因为没有定址锚点时，一份一天前的边缘副本与当前索引无从分辨。
- 解析结果连同它来源的 commit 一起持久化到 IndexedDB。下次启动立即用该缓存渲染，再把探测到的 commit 与存储的比较：相同则**完全跳过多 MB 的正文下载**。
- [index-stream.ts](../src/lib/registry/index-stream.ts) 中的 `INDEX_SPEC` 固定 `repo` / `path: "index.jsonl"` / `ref: "dist"`（上面的 commit 由每次下载注入）。
- 解析后过滤掉非 GitHub 仓库（`source` 含 `.` 视为域名），映射为 `Skill` 模型：`name = name ?? skillId`、`stars = stars ?? 0`。
- 下载是流式的：响应体逐行解码，每凑齐一行就立即解析，界面不必等待整份约 12MB 的文件。进度最多每 400ms 推送一次；某个下载源中途失败、切换到下一个候选重新解析时活动缓冲区会被清空重头解析，因此推送出的计数是单调的，永远只增不减。

### 界面

- 探索页在流式下载期间渐进渲染（计数显示为「N · 加载中」），侧边栏「全部」的数字随下载推进持续增长。
- 依赖全量数据的页面——精选页的榜单排名与精选 join、「我的技能」的元数据 join——以「下载完成」为门控，在此之前保持骨架屏，因为部分数据会导致排名错误。
- 「设置」页报告当前服务的快照（commit、发布时间、发布条目数），以及本次启动是重新下载还是复用了本地缓存；其按钮会强制重下，即使 commit 没有变化。

技能详情 `SKILL.md` 由 `source + path` 单独拉取，见 [../src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts)。
