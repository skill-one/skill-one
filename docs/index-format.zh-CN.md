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

## 当前使用方式

见 [../src/lib/skills-api.ts](../src/lib/skills-api.ts)：

- `INDEX_SPEC` 指定 `repo` / `path: "index.jsonl"` / `ref: "dist"`。
- 通过可配置下载源拉取（直连 GitHub raw 或 CDN 镜像），见 [../src/lib/cdn-config.ts](../src/lib/cdn-config.ts)。
- 解析后过滤掉非 GitHub 仓库（`source` 含 `.` 视为域名），映射为 `Skill` 模型：`name = name ?? skillId`、`stars = stars ?? 0`（索引中有单独的 `stars` 字段，仅部分条目携带）。
- 整份索引按会话缓存一次，本地切片分页（API 层默认 200/页；界面每页展示 24 张卡片），缓存与刷新交由 TanStack Query 管理。

技能详情 `SKILL.md` 由 `source + path` 单独拉取，见 [../src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts)。
