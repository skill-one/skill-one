# Architecture

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

## Overview

Skill One is a Tauri v2 desktop app. The frontend (React) handles rendering and data reads; the backend (Rust) handles every operation that modifies the local filesystem.

```
┌─────────────────────────────────────────────────────────┐
│                   React frontend (WebView)              │
│  components / hooks / lib                               │
│   ├── Read: skills-api.ts, skill-detail-api.ts          │
│   │         └─ cdn-config.ts (direct GitHub / CDN)      │
│   ├── Write: local-skills.ts ──► skills-manager.ts      │
│   │                             └─ invoke (Tauri IPC)   │
│   └── Fallback: mock-local.ts (in-memory, browser mode) │
└──────────────────────────┬──────────────────────────────┘
                           │ Tauri IPC
┌──────────────────────────▼──────────────────────────────┐
│                   Rust backend (src-tauri)              │
│   skills.rs: install / list / remove / enable / link     │
│   └─ agents-skills library (crates.io dependency)       │
└─────────────────────────────────────────────────────────┘
```

## Division of Responsibilities

### Frontend (reads)

- **`src/lib/registry/`**: The registry as a service — `client.ts` is the main-thread proxy of `worker.ts`, `index-stream.ts` probes the published snapshot and streams/parses `index.jsonl` (JSONL, line by line, so skills become available while the download runs), `worker-controller.ts` answers paged browse, search, featured and lookup requests, and `cache.ts` persists the parsed list. Consumers filter, sort, and paginate through it rather than holding the registry.
- **`src/lib/skill-detail-api.ts`**: Fetches a single skill's `SKILL.md` on demand and parses its frontmatter and body.
- **`src/lib/cdn-config.ts`**: Manages download sources. Defaults to direct `raw.githubusercontent.com` access, falls back to a CDN mirror (`cdn.jsdmirror.com`) on failure, and lets users configure a custom CDN in "Settings". Candidate URLs are tried in priority order — including mid-stream, when a body fails partway through — and the configuration is persisted to localStorage.

Read data is cached through TanStack Query (`staleTime` 10 minutes, `gcTime` infinite), so after a restart the app can render from cache first and refresh in the background. Each candidate request has a 10-second timeout guarding the response headers; streamed bodies additionally enforce a stall timeout between chunks (a multi-megabyte download legitimately outlasts any fixed cap). The registry index has its own two persistence layers, both inside the worker: the parsed list in IndexedDB and the commit it was addressed at (see *Browsing the skill list*), which together let a launch skip the download entirely when nothing was published since. Small queries such as the installed list and agent status are persisted through TanStack Query; the parsed index is far too large for the WebView localStorage quota and is deliberately kept out of it.

### Backend (writes)

- **`src-tauri/src/skills.rs`**: Exposes 7 Tauri commands (`install_skill`, `list_installed_skills`, `remove_skills`, `disable_skills`, `enable_skills`, `link_agents`, `link_status`), all of which route their blocking work (git clone, install, link, etc.) through a shared `spawn_blocking` helper to keep it off the async runtime.
- Internally, the commands delegate to the `Manager` facade of the `agents-skills` library and return camelCase DTOs to the frontend. Since `agents-skills` 0.9, linking never refuses because of existing content: pre-existing agent content is parked into a backup slot (adopted into the canonical dir with migrate) and restored on unlink, so the former `remove_stray_files` command is gone.

### Frontend write wrapper

- **`src/lib/skills-manager.ts`**: Typed wrapper (`invoke`) around the Tauri commands.
- **`src/lib/local-skills.ts`**: UI-facing data-access layer that uniformly handles the two implementations — "Tauri backend / browser mock" — transparently to components.

### Browser fallback

When the app is not running in a Tauri environment (e.g. `pnpm dev` or Vitest tests), `isTauri()` returns `false` and `local-skills.ts` falls back to the in-memory data in `mock-local.ts`, so the UI and interaction flows can be fully previewed without a native environment.

## Key Files

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Routing, layout, TanStack Query provider, and cache persistence |
| `src/components/app-sidebar.tsx` | Sidebar navigation (routes and titles share one config) plus the nav badges: 全部 counts the skills streamed in so far, 仓库 the aggregated repo total once the index is ready |
| `src/pages/explore/featured/` | Curated landing page: computed leaderboard hero carousel plus curated category sections |
| `src/data/featured-content.ts` | Hand-picked category → skill references for the featured page (the registry index carries no categories) |
| `src/lib/tauri.ts` | Detects whether the app runs inside the Tauri WebView |
| `src/lib/open-external.ts` | Opens external links in the system browser (Tauri needs the opener plugin) |
| `src-tauri/tauri.conf.json` | Window, build, and packaging configuration |
| `src-tauri/capabilities/default.json` | Permission declarations (`core:default`, `opener:default`) |

## Data Flow Examples

**Installing a skill**:

1. The user clicks "Install" on the explore page.
2. `local-skills.installSkillFromSource(repo, name)` checks the environment.
3. Tauri environment → `skills-manager.installSkill` → `invoke("install_skill", ...)` → Rust `install_skill` command → `agents-skills::Manager.add`.
4. When finished, the frontend refreshes the `installed-skills` query cache.
5. Browser environment → writes via `mock-local.installMockSkill`.

**Browsing the skill list**:

1. The registry lives in a lazily spawned worker (`lib/registry/worker.ts` behind the `lib/registry/client.ts` proxy): the main thread only ever receives page-sized answers and pushed progress, never the ~12 MB index.
2. On boot the worker reads the parsed index from IndexedDB (`lib/registry/cache.ts`) and serves it immediately — cold start paints from cache with no network wait.
3. It then probes `index-meta.json` for the published `distCommit`, requesting it with a cache-busting stamp so no cached copy can make an old commit look current. Same commit as the cached one: the multi-megabyte body is not downloaded at all.
4. Otherwise `registry/index-stream.ts` streams `index.jsonl` **addressed at that commit** (immutable, so a CDN copy is always the right bytes), parsing each line as it arrives; pages render from the partial list right away. A partial list is always a prefix of the final one in registry order, so paging stays stable while the count climbs — but the list is ordered by download count, so its first page is a best-so-far slice and early rows move down as the stream delivers more skills.
5. While streaming, search falls back to plain substring matching; the MiniSearch fuzzy index is built once the stream completes, because rebuilding it per snapshot would cost more than the download itself.
6. The landed dataset overwrites the IndexedDB record together with its identity (commit, `formatVersion`, generation stamp).
7. `cdn-config.ts` tries the configured CDN, direct GitHub and the default CDN in order; a source that fails mid-stream hands over to the next and restarts the parse.
8. The announced identity reaches the main thread through the client snapshot, where Settings shows which snapshot is in use and whether this launch reused the local cache. Only page results are kept in the TanStack Query memory cache; the registry itself is not duplicated there.
9. Ordering has one rule and one exception: the browsed list follows the toolbar's sort choice (download count by default, name as the alternative), while a search is always answered in relevance order (name match > repo > description, install count as the tie-break) whatever that choice says. The toolbar then swaps its sort dropdown for a read-only 相关度 label, so it never claims an order the results do not follow.

**Curated featured page**:

1. `featured-page` asks the worker to compute its payload, and keeps its skeleton until the index reports complete — rankings over an incomplete registry would be wrong.
2. The hero carousels are computed from the index (`featured-rankings.ts`): weekly installs, lifetime installs, and the weekly/lifetime share; the parser keeps each skill's most recent week as `weeklyInstalls`.
3. Category sections join the hand-picked references in `featured-content.ts` against the index; unresolved references are skipped and empty sections hidden.
