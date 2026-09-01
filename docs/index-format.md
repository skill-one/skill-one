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

## Consuming the index

Implemented in [src/lib/registry/](../src/lib/registry/) (worker + main-thread proxy), consumed by the store pages.

### The `index-meta.json` sidecar

The metadata published beside the index is what makes caching possible:

| Field | Role |
| --- | --- |
| `formatVersion` | Stored with the cached dataset, so a format change can be detected. |
| `generatedAt` | Displayed in Settings as the snapshot's publication time. |
| `counts.total` | Published entry count, shown in Settings next to the number actually loaded (which is lower: non-GitHub sources are filtered out). |
| `distCommit` | The `dist`-branch commit carrying this snapshot's `index.jsonl`. The download is addressed at it, which is what turns "did the index change?" into a string comparison. |

### Fetch strategy

- The pointer is probed first, through the configurable download source (see [src/lib/cdn-config.ts](../src/lib/cdn-config.ts)) and **with a cache-busting stamp**: a mutable file that reports freshness must never be served from a cache, or an old commit looks current. At ~300 B, busting it costs nothing.
- The body is then fetched at `distCommit` (`…/skills-index@<sha>/index.jsonl`, or `raw.githubusercontent.com/…/<sha>/…`). A commit-addressed URL is immutable, so no busting is applied and a CDN edge copy is necessarily the right bytes.
- If no source advertises a usable commit, the download falls back to the mutable `dist` ref — busted, because without a pin a day-old edge copy would be indistinguishable from the current index.
- The parsed list plus the commit it came from are persisted to IndexedDB. Next launch serves that cache immediately, then compares the probed commit with the stored one: equal means the multi-megabyte body is not downloaded at all.
- `INDEX_SPEC` in [index-stream.ts](../src/lib/registry/index-stream.ts) pins `repo` / `path: "index.jsonl"` / `ref: "dist"` (the ref above is supplied per download).
- After parsing, non-GitHub repositories are filtered out (a `source` containing `.` is treated as a domain) and entries are mapped to the `Skill` model: `name = name ?? skillId`, `stars = stars ?? 0`.
- The download is streamed: the response body is decoded line by line and each line is parsed as soon as it arrives, so the UI never waits for the whole ~12MB file. Progress is pushed at most every 400ms, and the live buffer is rewound when a source fails mid-stream and the next candidate restarts the file — announced counts are therefore monotonic.

### UI

- The explore page renders progressively while the stream runs (the count reads "N · 加载中" until it finishes) and the sidebar's 全部 badge climbs with it.
- Pages that need the whole registry — the featured page's leaderboards and curated joins, and My Skills' metadata join — gate on completion and keep their skeleton until the stream finishes, because partial data would rank the wrong skills.
- Settings reports the served snapshot (commit, publication time, published entry count) and whether this launch downloaded it or reused the local copy; its button forces a re-download even when the commit has not moved.

A skill's `SKILL.md` is fetched separately from `source + path`; see [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts).
