# Registry snapshot (skills.jsonl)

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

The store content comes from [skill-one/skills-profiles](https://github.com/skill-one/skills-profiles), a daily dataset covering every GitHub-sourced skill on [skills.sh](https://www.skills.sh) together with the classification it generates for each of them. The snapshot is published to the `dist` branch: one `skills.jsonl` row per skill, a `skills/` directory holding each skill's full files, a `profiles/` directory holding the dataset's own browsable copy of the classification, and an `upstream/` directory holding the mirrored sidecars (`stats.json`, `repos.jsonl`, `avatars/`).

## Format

One JSON object per line, sorted by installs descending:

```json
{
  "id": "vercel-labs/skills/find-skills",
  "installs": 3474068,
  "url": "https://www.skills.sh/vercel-labs/skills/find-skills",
  "description": "Helps users discover and install agent skills …",
  "description_zh": "帮助用户发现和安装 agent skills …",
  "hash": "b146008599c31057cef1c145774cea5d5afb30e8f43fa802e47a4b461419aaaf",
  "fetchedAt": "2026-09-06T07:57:37.803Z",
  "domain": "development"
}
```

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Canonical skills.sh id: `{owner}/{repo}/{slug}`. Multi-segment slugs are keyed with the slashes stripped, so the id always has exactly three segments. |
| `installs` | `number` | Total installs recorded by skills.sh |
| `url` | `string` | The skill's page on skills.sh |
| `description` | `string \| null` | From the SKILL.md frontmatter (empty when missing) |
| `description_zh` | `string \| null` | Chinese translation of `description`. The app prefers it in Chinese mode and falls back to `description` when it is missing or blank. |
| `hash` | `string \| null` | SHA-256 of the skill's files. Changes when any upstream file changes — i.e. **which version of the skill the snapshot describes**. |
| `fetchedAt` | `string` | When the scraper first fetched this content version (ISO, UTC): how long the *current* content has been published, not when the skill first appeared |
| `domain` | `string \| string[]` | The classification, drawn from a fixed English enum (`development`, `data-analysis`, …, `other`). The `dist` snapshot publishes the single best-fit key as a bare string; the field has also carried a 1–3 key list, best fit first, so the app reads either shape and keeps a list. [data/domains.ts](../src/data/domains.ts) maps a key to its display label and monochrome lucide icon. Absent for skills the generator has not reached. |

The classification rides the index row, so one parsed line yields a fully decorated skill — there is no second source to merge in afterwards. A skill may legitimately belong to several domains, which is why grouping and filtering match by membership rather than by an exact value.

A *missing* classification is a third state, not 其他: the enum's `other` is the dataset's answer that no domain fits, while a skill the generator never reached has no answer at all. The app marks the two apart — 其他 wears a mixed-shapes icon, the unanswered one a help icon (未分类) — and the filter bar keeps a chip for each, so a scope that promises 其他 never silently includes the skills nobody looked at.

GitHub star counts are **not** carried by the skill rows: they live in the `upstream/repos.jsonl` sidecar below and are joined in at parse time.

## Repo metadata (upstream/repos.jsonl)

One JSON object per line, one per GitHub repo, sorted by repo:

```json
{"repo": "vercel-labs/skills", "stars": 1523, "description": "Agents, skills, and plugins for Vercel", "pushedAt": "2026-09-11T14:02:11.000Z"}
```

| Field | Type | Description |
| --- | --- | --- |
| `repo` | `string` | `{owner}/{repo}` — the first two segments of every index id, i.e. the join key |
| `stars` | `number \| null` | GitHub stargazers of the repo; `null` when the repo is gone (the app normalizes that to 0) |
| `description` | `string \| null` | The repo's GitHub About text. Unused by the app: skill descriptions come from SKILL.md frontmatter. |
| `pushedAt` | `string \| null` | The repo's last push. Tracks the **repo**, not the skill — skill-level changes are what `hash` / `fetchedAt` describe. Unused by the app. |

## Owner avatars (upstream/avatars/)

The dataset copies every owner's GitHub avatar into the snapshot as a regular file at `upstream/avatars/{owner}.png` (a fixed `.png` extension regardless of the actual encoding — image decoders sniff the bytes). Owner avatars are therefore fetched through the same download source and CDN fallback chain as SKILL.md, pinned to the recorded snapshot tag when one is known. GitHub's own avatar endpoint (`github.com/{owner}.png`) stays at the end of the chain as a fallback for owners whose copy the dataset missed (a failed run leaves a hole until the next one); the owner's initial is the last resort.

## The classification files (profiles/)

Each classified skill also publishes `profiles/{id}/domain.json` — the same payload the index row carries — beside its human-readable `md/domain.md`. The app reads the index row and never fetches these; they exist as the dataset's own browsable copy. There is no per-skill cover illustration: the detail drawer's image slot shows the author's initial (see [src/components/skill-cover.tsx](../src/components/skill-cover.tsx)). Card lists show no image at all — a letter square repeated on every row was 48px of chrome carrying no fact about the skill — so each card is led by its name, with the source stated in words on the card's rail.

The index rows are joined with the `skills/` directory by id: `skills/{owner}/{repo}/{slug}/` holds exactly the files the upstream skill ships. The app maps each row to the `Skill` model as `name = slug`, `repo = {owner}/{repo}`, `path = skills/{id}` (the snapshot directory, used for detail fetches and basename matching), `rev = hash`, `firstSeenAt = fetchedAt`, `descriptionZh = description_zh`, `profile = { domain }` — with `stars` supplied by the joined `repos.jsonl` row (0 when unjoined).

The detail drawer shows `hash` as 版本 (`#b1460085`, full value in the tooltip) and `fetchedAt` as 收录时间, and the classification as the domain chip. An author-declared frontmatter `version` is deliberately not displayed next to it: it is a different kind of claim about a different thing.

## Consuming the snapshot

Implemented in [src/lib/registry/](../src/lib/registry/) (worker + main-thread proxy), consumed by the store pages.

### The `latest` pointer

Version resolution is **pointer-first**: upstream publishes a `latest` file at the root of its `dist` branch holding, on one line, the tag the branch currently points at — a day's baseline (`dist-<date>`) or one of the batches generated on top of it (`dist-<date>-N`). Reading that one small file is what names the version — every other address is built from the tag, so no tag listing, sorting or name parsing is involved, and it works through the configured download source instead of needing an API the CDN cannot provide. The read carries a **cache-busting stamp**: a mutable pointer whose job is to report freshness must never be answered from a cache, or an old snapshot looks current.

### The `upstream/stats.json` sidecar

The run stats published beside the index are what make caching possible:

| Field | Role |
| --- | --- |
| `finishedAt` | Identifies the snapshot: a run publishes once, so equal stamps mean equal bytes — this turns "did the index change?" into a string comparison. It is also displayed in Settings as the publication time. |
| `indexedRows` | Published row count, shown in Settings next to the number actually loaded (which can be lower: rows are filtered defensively). |

### Fetch strategy

- The tag comes from the `latest` pointer (above) and the download is addressed at it, i.e. at exactly the snapshot upstream publishes.
- `upstream/stats.json` is then read **pinned to that tag** — an immutable address, so no busting — for the publication stamp and row count. If it cannot be read, the tag alone still pins the body (only the "unchanged" short-circuit is lost). When the pointer itself is unreadable, the degraded path applies: `stats.json` on the mutable `dist` branch is probed cache-busted for the stamp, and the version stays unpinned. Nothing derives a tag from a timestamp: the pointer is upstream's own statement of it, so inferring it from `finishedAt` would only ever be a worse guess.
- The body is fetched at the `dist-<date>[-N]` tag (`…/skills-profiles@dist-2026-09-20-12/skills.jsonl`). Tags are immutable per snapshot, so no busting is applied and a CDN edge copy is necessarily the right bytes. (A re-run force-moves the tag to the newest snapshot; the changed `finishedAt` detects it and re-downloads.)
- If neither the pointer nor the branch stats could be resolved, the download falls back to the mutable `dist` ref — busted, because without a pin a day-old edge copy would be indistinguishable from the current index.
- The parsed list plus its identity (`tag` + `finishedAt`) are persisted to IndexedDB, and the tag is recorded to localStorage (`skill-one.indexTag`) where it pins SKILL.md detail fetches and shows in Settings. Next launch serves that cache immediately, then compares the probed stamp with the stored one: equal means the multi-megabyte body is not downloaded at all.
- While the app simply stays open, the probe is repeated: an hourly tick re-runs it once the last completed check is more than 12 hours old (the dataset publishes daily), and the window is consulted again when it comes back into view after a sleep. Nothing is asked of the user — a refresh swaps the served snapshot in place without blanking the UI, and a failed or uneventful check is not mentioned at all — but a check that actually lands a newer snapshot says so in passing, so the list changing underfoot never looks like a glitch. The `checkedAt` stamp on the served identity dates the check, which is what the window is measured from, and only a probe that actually answered writes one, so an unreachable source is simply retried on the next tick. Note that a periodic check which resolves no tag **never** falls back to an unpinned body fetch, unlike boot and a forced reload: an unreachable probe leaves the served data exactly as it was instead of pulling the whole index on a guess.
- `INDEX_SPEC` in [index-stream.ts](../src/lib/registry/index-stream.ts) pins `repo` / `path: "skills.jsonl"` / `ref: "dist"` (the ref above is supplied per download), and the two sidecars are addressed relative to it: `upstream/stats.json`, `upstream/repos.jsonl`.
- After parsing, ids that are not canonical GitHub ids (three segments, dot-free owner) are filtered out, and every row is mapped to the `Skill` model.
- The download is streamed: the response body is decoded line by line and each line is parsed as soon as it arrives, so the UI never waits for the whole ~6.9MB file. Progress is pushed at most every 400ms, and the live buffer is rewound when a source fails mid-stream and the next candidate restarts the file — announced counts are therefore monotonic.
- `upstream/repos.jsonl` (the GitHub-stars join table, above) is fetched pinned to the same snapshot tag, started alongside the body so its latency hides inside the multi-megabyte download; the parsed rows join into every skill line at parse time. It is garnish: an unreachable or absent sidecar leaves skills with 0 stars rather than failing the download. The "unchanged" short-circuit skips it entirely — cached skills already carry their stars. And a failed join is never persisted: the cold-start cache is written only when the sidecar answered (an empty map counts — null does not), so a star-less session is never carried into the next one; the next launch re-downloads and retries the join.

### UI

- The explore page renders progressively while the stream runs: its count reads "N · 加载中" until the download finishes.
- Pages that need the whole registry — My Skills' metadata join — gate on completion and keep their skeleton until the stream finishes, because partial data would resolve the wrong skills.
- Settings reports the served snapshot (`dist-<date>[-N]` tag, publication time, published row count) and whether this launch downloaded it or reused the local copy; until the live identity arrives it falls back to the recorded tag. It also dates the last completed check (`checkedAt`), which is what the automatic window is measured from. 检测更新 runs the same cheap check on demand, ignoring the freshness window, and reports whether anything landed; 立即重新下载 forces a re-download even when the run has not moved.

A skill's `SKILL.md` is fetched from the snapshot at `skills/{id}/SKILL.md`, pinned to the recorded snapshot tag when one exists (the mutable `dist` branch otherwise); see [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts).

The snapshot also ships a Chinese page for a subset of skills at `profiles/{id}/skill_zh.md` (no index row marks it; the file's presence is the only signal). In Chinese mode the detail drawer leads the body with that page and fetches the English `SKILL.md` only when the reader flips to it through the 查看原文 toggle — or right away for an untranslated skill, whose English body is the only one there is (a disk read reads the English file alone). The Chinese page's fetch is garnish like the repos sidecar: a missing page, network failure or server error all hand the body over to the English original.

Owner avatars (the author chip on a skill card's metadata rail, and the repo owner image on the detail drawer's repo line) are fetched from the snapshot at `upstream/avatars/{owner}.png` through the same download source chain, pinned to the recorded snapshot tag; see [src/components/owner-avatar.tsx](../src/components/owner-avatar.tsx). The avatar is decoration only: both the drawer's repo line and the card's rail print the repo as text right beside it, and the chip's hover card (see [src/components/repo-hover-card.tsx](../src/components/repo-hover-card.tsx)) adds the star count behind it — so the avatar is hidden from assistive tech.
