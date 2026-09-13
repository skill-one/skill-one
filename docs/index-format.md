# Registry snapshot (skills.jsonl)

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

The store content comes from [skill-one/skills-sh-mirror](https://github.com/skill-one/skills-sh-mirror), a daily mirror of every GitHub-sourced skill on [skills.sh](https://www.skills.sh). The snapshot is published to the `dist` branch: one `skills.jsonl` row per skill, plus a `skills/` directory holding each skill's full files.

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

### The `latest` pointer

Version resolution is **pointer-first**: upstream publishes a `latest` file at the root of its `dist` branch holding, on one line, the tag the branch currently points at (`dist-<date>`). Reading that one small file is what names the version — every other address is built from the tag, so no tag listing, sorting or name parsing is involved, and it works through the configured download source instead of needing an API the CDN cannot provide. The read carries a **cache-busting stamp**: a mutable pointer whose job is to report freshness must never be answered from a cache, or an old snapshot looks current.

`skill-one/skills-profiles` publishes on the same contract, so `readLatestTag` in [snapshot.ts](../src/lib/registry/snapshot.ts) implements the read once for both datasets. What it shares is the pointer, not the stats: its `stats.json` carries no `finishedAt` — the publisher stamps `publishedAt` as the snapshot's identity (only a snapshot whose content changed gets a new time) and records in `upstream` which mirror tag the profiles were generated from, which is what its `hash` values join against.

### The `stats.json` sidecar

The run stats published beside the index are what make caching possible:

| Field | Role |
| --- | --- |
| `finishedAt` | Identifies the snapshot: a run publishes once, so equal stamps mean equal bytes — this turns "did the index change?" into a string comparison. It is also displayed in Settings as the publication time. |
| `indexedRows` | Published row count, shown in Settings next to the number actually loaded (which can be lower: rows are filtered defensively). |

### Fetch strategy

- The tag comes from the `latest` pointer (above) and the download is addressed at it, i.e. at exactly the snapshot upstream publishes.
- `stats.json` is then read **pinned to that tag** — an immutable address, so no busting — for the publication stamp and row count. If it cannot be read, the tag alone still pins the body (only the "unchanged" short-circuit is lost). When the pointer itself is unreadable, the degraded path applies: `stats.json` on the mutable `dist` branch is probed cache-busted for the stamp, and the version stays unpinned. Nothing derives a tag from a timestamp any more: the pointer is upstream's own statement of it, so inferring it from `finishedAt` would only ever be a worse guess.
- The body is fetched at the `dist-<date>` tag (`…/skills-sh-mirror@dist-2026-09-06/skills.jsonl`). Tags are immutable per snapshot, so no busting is applied and a CDN edge copy is necessarily the right bytes. (A same-day re-run force-moves the tag to the newest snapshot; the changed `finishedAt` detects it and re-downloads.)
- If neither the pointer nor the branch stats could be resolved, the download falls back to the mutable `dist` ref — busted, because without a pin a day-old edge copy would be indistinguishable from the current index.
- The parsed list plus its identity (`tag` + `finishedAt`) are persisted to IndexedDB, and the tag is recorded to localStorage (`skill-one.indexTag`) where it pins SKILL.md detail fetches and shows in Settings. Next launch serves that cache immediately, then compares the probed stamp with the stored one: equal means the multi-megabyte body is not downloaded at all.
- While the app simply stays open, the probe is repeated: an hourly tick re-runs it once the last completed check is more than 12 hours old (both sources publish daily), and the window is consulted again when it comes back into view after a sleep. Nothing is asked of the user — a refresh swaps the served snapshot in place without blanking the UI, and a failed or uneventful check is not mentioned at all — but a check that actually lands a newer snapshot says so in passing, so the list changing underfoot never looks like a glitch. The `checkedAt` stamp on the served identity dates the check, which is what the window is measured from, and only a probe that actually answered writes one, so an unreachable source is simply retried on the next tick. Note that a periodic check which resolves no tag **never** falls back to an unpinned body fetch, unlike boot and a forced reload: an unreachable probe leaves the served data exactly as it was instead of pulling the whole index on a guess.
- `INDEX_SPEC` in [index-stream.ts](../src/lib/registry/index-stream.ts) pins `repo` / `path: "skills.jsonl"` / `ref: "dist"` (the ref above is supplied per download).
- After parsing, ids that are not canonical GitHub ids (three segments, dot-free owner) are filtered out, and every row is mapped to the `Skill` model.
- The download is streamed: the response body is decoded line by line and each line is parsed as soon as it arrives, so the UI never waits for the whole ~5.7MB file. Progress is pushed at most every 400ms, and the live buffer is rewound when a source fails mid-stream and the next candidate restarts the file — announced counts are therefore monotonic.
- `trending.json` (the trending view's top-100 ids, in upstream rank order) is fetched pinned to the same snapshot tag once it is known, so the leaderboard is read from the same snapshot as the index. An absent or unreachable list simply hides the section.

### UI

- The explore page renders progressively while the stream runs (the count reads "N · 加载中" until it finishes) and the sidebar's 全部 badge climbs with it.
- Pages that need the whole registry — the featured page's leaderboards and curated joins, and My Skills' metadata join — gate on completion and keep their skeleton until the stream finishes, because partial data would rank the wrong skills.
- Settings reports the served snapshot (`dist-<date>` tag, publication time, published row count) and whether this launch downloaded it or reused the local copy; until the live identity arrives it falls back to the recorded tag. It also dates the last completed check (`checkedAt`), which is what the automatic window is measured from. 检测更新 runs the same cheap check on demand, ignoring the freshness window, and reports whether anything landed; 立即重新下载 forces a re-download even when the run has not moved.

A skill's `SKILL.md` is fetched from the mirror snapshot at `skills/{id}/SKILL.md`, pinned to the recorded snapshot tag when one exists (the mutable `dist` branch otherwise); see [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts).
