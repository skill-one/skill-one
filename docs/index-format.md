# Registry snapshot (skills.jsonl)

[English](index-format.md) | [简体中文](index-format.zh-CN.md)

The store content comes from [skill-one/skills-profiles](https://github.com/skill-one/skills-profiles), a daily dataset covering every GitHub-sourced skill on [skills.sh](https://www.skills.sh) together with the classification it generates for each of them. The snapshot is published to the `dist` branch as one directory: the `skills.jsonl` catalog (one row per skill), a `skills/` directory holding each skill's own `SKILL.md` and the Chinese page written about it, a `repos.jsonl` sidecar (one row per GitHub repo), and an `owners/` directory holding each owner's avatar.

## Format

One JSON object per line, sorted by installs descending:

```json
{
  "id": "vercel-labs/skills/find-skills",
  "name": "find-skills",
  "installs": 3630988,
  "dir": "vercel-labs/skills/find-skills",
  "description": "Helps users discover and install agent skills …",
  "description_zh": "帮助用户发现和安装 agent skills …",
  "domain": "development",
  "confidence": 0.8
}
```

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Canonical skills.sh id: `{owner}/{repo}/{slug}`, spelled the way the mirror lists it. Multi-segment slugs are keyed with the slashes stripped, so the id always has exactly three segments. |
| `name` | `string \| null` | The skill's frontmatter `name`, as the mirror spells it. |
| `installs` | `number` | Total installs recorded by skills.sh |
| `dir` | `string \| null` | Directory the skill's files live at, relative to `skills/` — the row's own `owner/repo` leading a path that can differ from the id's spelling. Null while the repository has not been fetched. |
| `description` | `string \| null` | From the SKILL.md frontmatter (empty when missing) |
| `description_zh` | `string \| null` | Chinese translation of `description`. The app prefers it in Chinese mode and falls back to `description` when it is missing or blank. |
| `domain` | `string \| null` | The classification: one of 13 closed English categories (`development`, `data-analysis`, …, `other`). Null for skills the generator has not reached. [data/domains.ts](../src/data/domains.ts) maps a key to its display label and colored emoji. |
| `confidence` | `number \| null` | The classifier's own reading of how close the call was (0–1); null when it does not say — published to be sorted on, not trusted as a probability. |

The classification rides the index row, so one parsed line yields a fully decorated skill — there is no second source to merge in afterwards. The app keeps the upstream key as a one-element list in its model, so grouping and filtering can match by membership.

A *missing* classification is a third state, not 其他: the enum's `other` is the dataset's answer that no domain fits, while a skill the generator never reached has no answer at all. The app marks the two apart — 其他 wears a leftovers box, the unanswered one a question mark (未分类) — and the filter bar keeps a chip for each, so a scope that promises 其他 never silently includes the skills nobody looked at.

GitHub star counts are **not** carried by the skill rows: they live in the `repos.jsonl` sidecar below and are joined in at parse time.

## Repo metadata (repos.jsonl)

One JSON object per line, one per GitHub repo:

```json
{"id": "vercel-labs/skills", "owner": "vercel-labs", "repo": "skills", "description": "The open agent skills tool - npx skills", "stars": 32793, "updated_at": "2026-09-30T01:48:12Z", "pushed_at": "2026-09-28T20:20:57Z", "html_url": "https://github.com/vercel-labs/skills", "gone": false, "fetched_at": "2026-09-30T01:50:01Z"}
```

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | `{owner}/{repo}` — the first two segments of every index id, i.e. the join key |
| `owner` / `repo` | `string` | The join key, split. |
| `stars` | `number \| null` | GitHub stargazers of the repo; `null` when the repo is gone (the app normalizes that to 0) |
| `description` | `string \| null` | The repo's GitHub About text. Unused by the app: skill descriptions come from SKILL.md frontmatter. |
| `updated_at` / `pushed_at` / `fetched_at` | `string \| null` | Repo timestamps. Tracks the **repo**, not the skill. Unused by the app. |
| `html_url` | `string \| null` | The repo's GitHub page. Unused by the app. |
| `gone` | `boolean` | GitHub has no answer for this repo (renamed or deleted). The app normalizes its null stars to 0. |

## Owner avatars (owners/)

The dataset copies every owner's GitHub avatar into the snapshot as a regular file at `owners/{owner}.png` (a fixed `.png` extension regardless of the actual encoding — image decoders sniff the bytes). Owner avatars are therefore fetched through the same download source and CDN fallback chain as SKILL.md, on the snapshot's `dist` branch. GitHub's own avatar endpoint (`github.com/{owner}.png`) stays at the end of the chain as a fallback for owners whose copy the dataset missed (a failed run leaves a hole until the next one); the owner's initial is the last resort.

## The skill directories (skills/)

The index rows are joined with the `skills/` directory by the row's `dir`: `skills/<dir>/` holds the skill's own `SKILL.md`, the dataset's typed answer (`domain.json`), and the Chinese page `SKILL.zh.md`. The app reads the index row and never fetches `domain.json`. There is no per-skill cover illustration: the detail drawer's image slot shows the author's initial (see [src/components/skill-cover.tsx](../src/components/skill-cover.tsx)). Card lists show no image at all — a letter square repeated on every row was 48px of chrome carrying no fact about the skill — so each card is led by its name, with the source stated in words on the card's rail.

The app maps each row to the `Skill` model as `name = the id's slug`, `id = the row's id`, `repo = {owner}/{repo}`, `path = skills/<dir>` (the snapshot directory, used for detail fetches and basename matching), `url = https://www.skills.sh/{id}` (derived), `descriptionZh = description_zh`, `profile = { domain: [domain], confidence }` — with `stars` supplied by the joined `repos.jsonl` row (0 when unjoined). The name stays the slug rather than the row's frontmatter `name`: the slug is the one skills.sh identity every consumer shares — what a locally installed copy is called (agents-skills matches installs by the slugified frontmatter `name`) and what the live skills.sh search reports. The raw spelling is not thrown away, though: when the frontmatter `name` folds to a different string than the slug, the row carries it as `displayName`, which the UI renders as the skill's title, and the `id` itself rides on the row so install sends it verbatim instead of rebuilding it from repo plus slug. The snapshot publishes no per-skill content hash or first-fetch date, so the model carries no `rev`/`firstSeenAt` anymore.

The detail drawer shows the classification as the domain chip, and the exact SKILL.md path in the 源 tip.

## Consuming the snapshot

Implemented in [src/lib/registry/](../src/lib/registry/) (worker + main-thread proxy), consumed by the store pages.

### The etag probe

Upstream publishes no pointer file and no per-run stats sidecar: the only statement of "what is current" is the `dist` branch itself. Version resolution is therefore **etag-only**: a cache-busted `HEAD` on the branch's `skills.jsonl` (through the same candidate chain every other fetch uses) answers with the body's etag — a content hash, so equal etag still means equal index bytes, which makes it the freshness identity the "unchanged" short-circuit compares. The body's `Last-Modified` stamp rides along when the source gives one, so Settings can still say when the snapshot was published. GitHub's API is deliberately never called: an anonymous API request is rate-limited per IP and is the one call in the data layer that can be refused for reasons the app cannot control. `HEAD` transfers no body, so probing the multi-megabyte file costs only headers.

### Fetch strategy

- The snapshot is addressed at the mutable `dist` branch — the only address upstream publishes — and every snapshot fetch (probe, body, sidecar) carries a **cache-busting stamp**: without a commit SHA to pin to, a day-old edge copy would otherwise be indistinguishable from the current index.
- The parsed list plus its identity (etag + `Last-Modified`) are persisted to IndexedDB. Next launch serves that cache immediately, then compares the probed etag with the stored one: equal means the multi-megabyte body is not downloaded at all.
- While the app simply stays open, the probe is repeated: an hourly tick re-runs it once the last completed check is more than 12 hours old (the dataset publishes daily), and the window is consulted again when it comes back into view after a sleep. Nothing is asked of the user — a refresh swaps the served snapshot in place without blanking the UI, and a failed or uneventful check is not mentioned at all — but a check that actually lands a newer snapshot says so in passing, so the list changing underfoot never looks like a glitch. The `checkedAt` stamp on the served identity dates the check, which is what the window is measured from, and only a probe that actually answered writes one, so an unreachable source is simply retried on the next tick. Note that a periodic check which reads no etag **never** falls through to a body fetch, unlike boot and a forced reload: an unreachable probe leaves the served data exactly as it was instead of pulling the whole index on a guess.
- `INDEX_SPEC` in [index-stream.ts](../src/lib/registry/index-stream.ts) holds `repo` / `path: "skills.jsonl"` / `ref: "dist"`, and the sidecar is addressed relative to it: `repos.jsonl`.
- After parsing, ids that are not canonical GitHub ids (three segments, dot-free owner) are filtered out, and every row is mapped to the `Skill` model.
- The download is streamed: the response body is decoded line by line and each line is parsed as soon as it arrives, so the UI never waits for the whole ~8MB file. Progress is pushed at most every 400ms, and the live buffer is rewound when a source fails mid-stream and the next candidate restarts the file — announced counts are therefore monotonic.
- `repos.jsonl` (the GitHub-stars join table, above) is fetched alongside the body so its latency hides inside the multi-megabyte download; the parsed rows join into every skill line at parse time. It is garnish: an unreachable or absent sidecar leaves skills with 0 stars rather than failing the download. The "unchanged" short-circuit skips it entirely — cached skills already carry their stars. And a failed join is never persisted: the cold-start cache is written only when the sidecar answered (an empty map counts — null does not), so a star-less session is never carried into the next one; the next launch re-downloads and retries the join.

### UI

- The explore page renders progressively while the stream runs: its count reads "N · 加载中" until the download finishes.
- Pages that need the whole registry — the installed page's metadata join — gate on completion and keep their skeleton until the stream finishes, because partial data would resolve the wrong skills.
- Settings reports the served snapshot (its etag, publication time, row count) and whether this launch downloaded it or reused the local copy. It also dates the last completed check (`checkedAt`), which is what the automatic window is measured from. 检测更新 runs the same cheap check on demand, ignoring the freshness window, and reports whether anything landed; 立即重新下载 forces a re-download even when the snapshot has not moved.

A skill's `SKILL.md` is fetched from the snapshot at `skills/<dir>/SKILL.md` on the `dist` branch; see [src/lib/skill-detail-api.ts](../src/lib/skill-detail-api.ts). A CDN edge copy may briefly trail the freshest publish — for a SKILL.md body that is a lag of at most one daily run.

The snapshot also ships a Chinese page for a subset of skills at `skills/<dir>/SKILL.zh.md` (no index row marks it; the file's presence is the only signal). In Chinese mode the detail drawer leads the body with that page and fetches the English `SKILL.md` only when the reader flips the drawer to the original through the header's 查看原文 toggle (one toggle for the description and the body together) — or right away for an untranslated skill, whose English body is the only one there is (a disk read reads the English file alone). The Chinese page's fetch is garnish like the repos sidecar: a missing page, network failure or server error all hand the body over to the English original.

Owner avatars (the author chip on a skill card's metadata rail, and the repo owner image on the detail drawer's repo line) are fetched from the snapshot at `owners/{owner}.png` through the same download source chain; see [src/components/owner-avatar.tsx](../src/components/owner-avatar.tsx). The avatar is decoration only: both the drawer's repo line and the card's rail print the repo as text right beside it, and the chip's hover card (see [src/components/repo-hover-card.tsx](../src/components/repo-hover-card.tsx)) adds the star count behind it — so the avatar is hidden from assistive tech.
