# Registry snapshot (skills.jsonl)

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

The store content comes from [skill-one/skills-sh-scraper](https://github.com/skill-one/skills-sh-scraper), a daily mirror of every GitHub-sourced skill on [skills.sh](https://www.skills.sh). The snapshot is published to the `dist` branch: one `skills.jsonl` row per skill, plus a `skills/` directory holding each skill's full files.

## Format

One JSON object per line, sorted by installs descending:

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

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Canonical skills.sh id: `{owner}/{repo}/{slug}`. Multi-segment slugs are keyed with the slashes stripped, so the id always has exactly three segments. |
| `installs` | `number` | Total installs recorded by skills.sh |
| `stars` | `number \| null` | GitHub stars of the source repo (`null` when the repo is gone; normalized to 0) |
| `url` | `string` | The skill's page on skills.sh |
| `description` | `string \| null` | From the SKILL.md frontmatter (empty when missing) |
| `hash` | `string \| null` | SHA-256 of the skill's files. Changes when any upstream file changes — i.e. **which version of the skill the snapshot describes**. |
| `fetchedAt` | `string` | When the scraper first fetched this content version (ISO, UTC): how long the *current* content has been published, not when the skill first appeared |

The index rows are joined with the `skills/` directory by id: `skills/{owner}/{repo}/{slug}/` holds exactly the files the upstream skill ships. The app maps each row to the `Skill` model as `name = slug`, `repo = {owner}/{repo}`, `path = skills/{id}` (the mirror directory, used for detail fetches and basename matching), `rev = hash`, `firstSeenAt = fetchedAt`.

The detail drawer shows `hash` as 版本 (`#b1460085`, full value in the tooltip) and `fetchedAt` as 收录时间. An author-declared frontmatter `version` is deliberately not displayed next to it: it is a different kind of claim about a different thing.

## Consuming the snapshot

Implemented in [src/lib/registry/](../src/lib/registry/) (worker + main-thread proxy), consumed by the store pages.

### The `stats.json` sidecar

The run stats published beside the index are what make caching possible:

| Field | Role |
| --- | --- |
| `finishedAt` | Identifies the snapshot: a run publishes once, so equal stamps mean equal bytes — this turns "did the index change?" into a string comparison. It is also displayed in Settings as the publication time. |
| `indexedRows` | Published row count, shown in Settings next to the number actually loaded (which can be lower: rows are filtered defensively). |
| `startedAt` (date part) | The UTC day the run finished on — the same day upstream CI tags the snapshot with. |

### Fetch strategy

- The pointer is probed first, through the configurable download source (see [src/lib/cdn-config.ts](../src/lib/cdn-config.ts)) and **with a cache-busting stamp**: a mutable file that reports freshness must never be served from a cache, or an old snapshot looks current. At ~300 B, busting it costs nothing.
- The body is then fetched at the derived `dist-<date>` tag (`…/skills-sh-scraper@dist-2026-09-06/skills.jsonl`). Tags are immutable per snapshot, so no busting is applied and a CDN edge copy is necessarily the right bytes. (A same-day re-run force-moves the tag to the newest snapshot; the changed `finishedAt` detects it and re-downloads.)
- If no source advertises a usable date, the download falls back to the mutable `dist` ref — busted, because without a pin a day-old edge copy would be indistinguishable from the current index.
- The parsed list plus its identity (`tag` + `finishedAt`) are persisted to IndexedDB. Next launch serves that cache immediately, then compares the probed stamp with the stored one: equal means the multi-megabyte body is not downloaded at all.
- `INDEX_SPEC` in [index-stream.ts](../src/lib/registry/index-stream.ts) pins `repo` / `path: "skills.jsonl"` / `ref: "dist"` (the ref above is supplied per download).
- After parsing, ids that are not canonical GitHub ids (three segments, dot-free owner) are filtered out, and every row is mapped to the `Skill` model.
- The download is streamed: the response body is decoded line by line and each line is parsed as soon as it arrives, so the UI never waits for the whole ~5.7MB file. Progress is pushed at most every 400ms, and the live buffer is rewound when a source fails mid-stream and the next candidate restarts the file — announced counts are therefore monotonic.
- `trending.json` (the trending view's top-100 ids, in upstream rank order) is fetched concurrently with the download; the trending leaderboard and hero slide rank the registry by that order. An absent or unreachable list simply hides the section.

### UI

- The explore page renders progressively while the stream runs (the count reads "N · 加载中" until it finishes) and the sidebar's 全部 badge climbs with it.
- Pages that need the whole registry — the featured page's leaderboards and curated joins, and My Skills' metadata join — gate on completion and keep their skeleton until the stream finishes, because partial data would rank the wrong skills.
- Settings reports the served snapshot (`dist-<date>` tag, publication time, published row count) and whether this launch downloaded it or reused the local copy; its button forces a re-download even when the run has not moved.

A skill's `SKILL.md` is fetched from the mirror snapshot at `skills/{id}/SKILL.md`; see [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts).
