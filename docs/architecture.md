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

- **`src/lib/skills-api.ts`**: Fetches and parses the skills registry index (JSONL) as a stream, so skills become available progressively while the download is still running; consumers filter, sort, and paginate them client-side.
- **`src/lib/skill-detail-api.ts`**: Fetches a single skill's `SKILL.md` on demand and parses its frontmatter and body.
- **`src/lib/cdn-config.ts`**: Manages download sources. Defaults to direct `raw.githubusercontent.com` access, falls back to a CDN mirror (`cdn.jsdmirror.com`) on failure, and lets users configure a custom CDN in "Settings". Candidate URLs are tried in priority order — including mid-stream, when a body fails partway through — and the configuration is persisted to localStorage.

Read data is cached and persisted uniformly through TanStack Query (`staleTime` 10 minutes, `gcTime` infinite), so after a restart the app can render from cache first and refresh in the background. Each candidate request has a 10-second timeout guarding the response headers; streamed bodies additionally enforce a stall timeout between chunks (a multi-megabyte download legitimately outlasts any fixed cap). Persistence excludes the full-index query (`skills`, the shared streaming entry that stores the parsed list with a completion flag) — the parsed index is too large for the WebView localStorage quota and is re-fetched every session; only small queries such as the installed list and agent status are written to disk.

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
| `src/components/app-sidebar.tsx` | Sidebar navigation (routes and titles share one config) |
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

1. `explore-page` subscribes to the index through the `useSkillsIndex` hook, which starts the download and mirrors every progress snapshot into the TanStack Query cache as `{ skills, complete: false }`.
2. `skills-api.ts` streams the index (cached per session) and parses each line as it arrives; pages render from the partial list right away — partial lists are always prefixes of the final one, so pagination and the default order stay stable while the count climbs.
3. While streaming, search falls back to plain substring matching; the MiniSearch fuzzy index is built once the stream completes (`complete: true`), because rebuilding it per snapshot would cost more than the download itself.
4. `cdn-config.ts` tries direct GitHub access and CDN mirrors in order.
5. TanStack Query caches the result in memory (not persisted — too large); paging and in-session navigation hit the cache first.

**Curated featured page**:

1. `featured-page` reads the same cached index as explore (shared query key), but keeps its skeleton until the stream completes — rankings over an incomplete registry would be wrong.
2. The hero carousels are computed from the index (`featured-rankings.ts`): weekly installs, lifetime installs, and the weekly/lifetime share; the parser keeps each skill's most recent week as `weeklyInstalls`.
3. Category sections join the hand-picked references in `featured-content.ts` against the index; unresolved references are skipped and empty sections hidden.
