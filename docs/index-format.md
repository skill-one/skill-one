# Registry index (index.jsonl)

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

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
  "description": "Discover and install agent skills",
  "rev": "t1-a4cf6ce14f6d65b3",
  "firstSeenAt": "2026-08-12T04:34:54Z"
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
| `stars`           | `number`   | GitHub stars of the source repo (optional; normalized to 0 when missing) |
| `rev`             | `string`   | Content fingerprint of the skill directory (`t1-<16 hex>`; `t1` names the fingerprint scheme). Changes when any file inside the directory changes, including its mode — i.e. **which version of the skill the index describes**. |
| `firstSeenAt`     | `string`   | When the registry first recorded this `rev` (ISO, UTC): how long the *current* content has been published, not when the skill first appeared |

> `source` / `skillId` / `installs` / `weeklyInstalls` come from skills.sh; `path` / `description` / `rev` / `firstSeenAt` are obtained by scanning the repositories.
>
> `rev` and `firstSeenAt` are absent on the (~2.5%) entries whose repository content could not be scanned. Where present the skill detail drawer shows both — the fingerprint as 版本 (`#a4cf6ce1`, full value in the tooltip) and the stamp as 收录时间. An author-declared frontmatter `version` is deliberately not displayed next to it: it is a different kind of claim about a different thing.

## How it is used today

See [src/lib/skills-api.ts](../src/lib/skills-api.ts):

- `INDEX_SPEC` specifies `repo` / `path: "index.jsonl"` / `ref: "dist"`.
- The index is fetched through the configurable download source (direct GitHub raw or a CDN mirror); see [src/lib/cdn-config.ts](../src/lib/cdn-config.ts).
- After parsing, non-GitHub repositories are filtered out (a `source` containing `.` is treated as a domain) and entries are mapped to the `Skill` model: `name = name ?? skillId`, `stars = stars ?? 0` (the index carries a separate `stars` field for entries that have one).
- The download is streamed: the response body is decoded line by line and each line is parsed as soon as it arrives, so the UI never waits for the whole ~12MB file. Snapshots of everything parsed so far are pushed to subscribers at most once every 400ms (see `subscribeIndexProgress`), and the live buffer is rewound when a download source fails mid-stream and the next candidate restarts the file — announced snapshots are therefore monotonic and never shrink.
- The full index is cached once per session and paginated locally (200 per page at the API level; the UI shows 24 cards per page); caching and refreshing are handled by TanStack Query. The cached entry is `{ skills, complete }`, where `complete` is false while the stream is still running.
- The explore page renders progressively from those snapshots (the count reads "N · 加载中" until the stream finishes), and the sidebar's 全部 badge shows the number of skills parsed so far, climbing as the download proceeds. It is hidden again if the download fails, since React Query keeps the last snapshot in `data`.
- Pages that need the whole registry — the featured page's leaderboards and curated joins, and My Skills' metadata join — gate on `complete` and keep their skeleton until the stream finishes, because partial data would rank the wrong skills.

A skill's `SKILL.md` is fetched separately from `source + path`; see [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts).
