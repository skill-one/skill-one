# Registry index (index.jsonl)

[English](index-format.md) | [简体中文](zh-CN/index-format.md)

The store content comes from the `index.jsonl` published by
[skill-one/skills-index](https://github.com/skill-one/skills-index) (JSONL format, published on the `dist` branch, one skill per line).

## Format

One JSON object per line:

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

| Field             | Type       | Description                                                  |
| ----------------- | ---------- | ------------------------------------------------------------ |
| `source`          | `string`   | Source repository, in `owner/repo` form                      |
| `skillId`         | `string`   | Skill identifier; also used as the skill name (no separate `name` field) |
| `installs`        | `number`   | Total installs                                               |
| `weeklyInstalls`  | `number[]` | Installs over recent weeks                                   |
| `path`            | `string`   | Skill's directory relative to the repo root (used to build the `SKILL.md` URL) |
| `description`     | `string`   | Skill description (optional, empty when missing)             |

> `source` / `skillId` / `installs` / `weeklyInstalls` come from skills.sh; `path` / `description` are obtained by scanning the repositories.

## How it is used today

See [src/lib/skills-api.ts](../src/lib/skills-api.ts):

- `INDEX_SPEC` specifies `repo` / `path: "index.jsonl"` / `ref: "dist"`.
- The index is fetched through the configurable download source (direct GitHub raw or a CDN mirror); see [src/lib/cdn-config.ts](../src/lib/cdn-config.ts).
- After parsing, non-GitHub repositories are filtered out (a `source` containing `.` is treated as a domain) and entries are mapped to the `Skill` model: `name = name ?? skillId`, `stars = installs`.
- The full index is cached once per session and paginated locally (200 per page by default); caching and refreshing are handled by TanStack Query.

A skill's `SKILL.md` is fetched separately from `source + path`; see [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts).
