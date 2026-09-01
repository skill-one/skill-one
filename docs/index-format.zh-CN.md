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
  "description": "Discover and install agent skills",
  "rev": "t1-a4cf6ce14f6d65b3",
  "firstSeenAt": "2026-08-12T04:34:54Z"
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
| `rev`             | `string`   | 技能目录的内容指纹（`t1-<16 hex>`，`t1` 是指纹算法标识）。目录内任何文件变化——含文件权限变化——都会使其改变，即**索引所描述的那个版本** |
| `firstSeenAt`     | `string`   | 注册表首次记录该 `rev` 的时间（ISO，UTC）：说的是*当前内容*发布了多久，不是技能最早何时进入索引 |

> `source` / `skillId` / `installs` / `weeklyInstalls` 来自 skills.sh；`path` / `description` / `rev` / `firstSeenAt` 由仓库扫描得到。
>
> 约 2.5% 未能扫描到仓库内容的条目不带 `rev` 与 `firstSeenAt`。带有的情况下，技能详情抽屉会展示两者——指纹以「版本」呈现（`#a4cf6ce1`，完整值放 tooltip），时间以「收录时间」呈现。作者自己在 frontmatter 写的 `version` 刻意不再并列展示：它是对另一件事的声明。

## 当前使用方式

见 [../src/lib/skills-api.ts](../src/lib/skills-api.ts)：

- `INDEX_SPEC` 指定 `repo` / `path: "index.jsonl"` / `ref: "dist"`。
- 通过可配置下载源拉取（直连 GitHub raw 或 CDN 镜像），见 [../src/lib/cdn-config.ts](../src/lib/cdn-config.ts)。
- 解析后过滤掉非 GitHub 仓库（`source` 含 `.` 视为域名），映射为 `Skill` 模型：`name = name ?? skillId`、`stars = stars ?? 0`（索引中有单独的 `stars` 字段，仅部分条目携带）。
- 下载是流式的：响应体逐行解码，每凑齐一行就立即解析，界面不必等待整份约 12MB 的文件。已解析内容的快照以最多每 400ms 一次的频率推送给订阅者（见 `subscribeIndexProgress`）；当某个下载源中途失败、切换到下一个候选源重新解析时，活动缓冲区会被清空，因此推送出去的快照是单调的，永远只增不减。
- 整份索引按会话缓存一次，本地切片分页（API 层默认 200/页；界面每页展示 24 张卡片），缓存与刷新交由 TanStack Query 管理。缓存条目形如 `{ skills, complete }`，流式下载尚未结束时 `complete` 为 false。
- 探索页依据这些快照渐进渲染（下载未完成时计数显示为「N · 加载中」），侧边栏「全部」的数字展示已解析的技能数，并随下载推进持续增长；若下载失败则重新隐藏该数字，因为 React Query 会在 `data` 中保留最后一个快照。
- 依赖全量数据的页面——精选页的榜单排名与精选 join、以及「我的技能」的元数据 join——仍以 `complete` 为门控，在流式下载完成前保持骨架屏，因为部分数据会导致排名错误。

技能详情 `SKILL.md` 由 `source + path` 单独拉取，见 [../src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts)。
