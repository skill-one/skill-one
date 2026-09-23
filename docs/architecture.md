# Architecture

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

## Overview

Skill One is a Tauri v2 desktop app. The frontend (React) handles rendering and data reads; the backend (Rust) handles every operation that modifies the local filesystem.

```
┌─────────────────────────────────────────────────────────┐
│                   React frontend (WebView)              │
│  components / hooks / lib                               │
│   ├── Read: lib/registry/, skill-*-api.ts               │
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

- **`src/lib/registry/`**: The registry as a service — `client.ts` is the main-thread proxy of `worker.ts`, `index-stream.ts` probes the published snapshot and streams/parses `skills.jsonl` (JSONL, line by line, so skills become available while the download runs), `worker-controller.ts` answers grouped browse, search and lookup requests, and `cache.ts` persists the parsed list. Consumers filter and group through it rather than holding the registry.
- **`src/lib/search-index.ts`**: The store's single search entry point — a MiniSearch index over the skill's name, shared by the skill registry and the installed list. It defines what counts as a match (see *Browsing the skill list*, step 9), on MiniSearch's own tokenizer; `src/lib/search-skills.ts` adds the registry's own ranking on top (name tiers, install count). Neither the repository nor the description is a search field. The registry builds its index inside the worker, the small per-page lists build one in a `useMemo`.
- **`src/lib/skill-detail-api.ts`**: Fetches a single skill's `SKILL.md` on demand and parses its frontmatter and body.
- **`src/lib/cdn-config.ts`**: Manages download sources. Defaults to direct `raw.githubusercontent.com` access, falls back to a CDN mirror (`cdn.jsdmirror.com`) on failure, and lets users configure a custom CDN in "Settings". Candidate URLs are tried in priority order — including mid-stream, when a body fails partway through — and the configuration is persisted to localStorage.

Read data is cached through TanStack Query (`staleTime` 10 minutes, `gcTime` infinite), so after a restart the app can render from cache first and refresh in the background. Each candidate request has a 10-second timeout guarding the response headers; streamed bodies additionally enforce a stall timeout between chunks (a multi-megabyte download legitimately outlasts any fixed cap). The registry index has its own two persistence layers, both inside the worker: the parsed list in IndexedDB and the tag it was addressed at (see *Browsing the skill list*), which together let a launch skip the download entirely when nothing was published since. Small queries such as the installed list and agent status are persisted through TanStack Query; the parsed index is far too large for the WebView localStorage quota and is deliberately kept out of it.

### Backend (writes)

- **`src-tauri/src/skills.rs`**: Exposes 8 Tauri commands (`install_skill`, `list_installed_skills`, `remove_skills`, `set_skills_enabled`, `link_agents`, `link_status`, `read_skill_md`, `compute_skill_hash`), all of which route their blocking work (GitHub downloads, install, link, hashing, etc.) through a shared `spawn_blocking` helper to keep it off the async runtime.
- Internally, the commands delegate to the `Manager` facade of the `agents-skills` library and return camelCase DTOs to the frontend. Since agents-skills 0.15 linking is one-way: an agent's own skills are adopted into the canonical dir (a name clash keeps the canonical copy), its other files are quarantined into `.misc/<agent>/`, and unlink only breaks the symlink. `list` also reports each skill's description and install time, which the app passes straight through. Since 0.21 an install is one source and one skill — `owner/repo@<skill>`, resolved through the GitHub API, which downloads only the matched skill directory — and a failure is the command's `Err`, so `install_skill` returns just `{ skill, skipped }`.

### Frontend write wrapper

- **`src/lib/skills-manager.ts`**: Typed wrapper (`invoke`) around the Tauri commands.
- **`src/lib/local-skills.ts`**: UI-facing data-access layer that uniformly handles the two implementations — "Tauri backend / browser mock" — transparently to components.

### Browser fallback

When the app is not running in a Tauri environment (e.g. `pnpm dev` or Vitest tests), `isTauri()` returns `false` and `local-skills.ts` falls back to the in-memory data in `mock-local.ts`, so the UI and interaction flows can be fully previewed without a native environment.

## Key Files

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Routing, layout, TanStack Query provider, and cache persistence |
| `src/components/app-header.tsx` | The app's chrome, one row: the brand on the window's centreline, the current list's search field leading the row and its unit switch closing it, and the window's drag region — which is what the overlay title bar leaves to the app. A page inside a list has none of those controls, so the row is the brand alone |
| `src/components/drill-down-head.tsx` | A page inside a list, as its own head: the way back to that list, the entity's face and name, the figures the page states about it, and its one action — one row, above the scroll container, so a page that scrolls leaves its subject and its way out on screen. A repository fills the face and the action, the local pool has neither |
| `src/components/app-rail.tsx` | The app's navigation: a 72px rail holding the two destinations and the settings entry |
| `src/components/list-toolbar.tsx` | The two controls both lists share, in the header's first row: what the reader is looking for (locked on the store until the index over the registry is ready) and how the list reads. Bound to the shared view rather than to either page, which is what makes them the same controls in both |
| `src/components/list-facets.tsx` | The scope chips of the list on screen, opening that list's own content: as many as the line holds, and a 更多 flyout for the rest |
| `src/lib/list-view.ts` | The shared view behind those controls: one query for both lists, and each list's own unit and scope |
| `src/lib/facet-overflow.ts` | How many chips fit on the header's line — pure arithmetic over measured widths |
| `src/pages/explore/repo-card.tsx` / `repo-page.tsx` | The store's repository view: one card per repository, led by its most-installed skills in a capped list and signed off by a single bottom bar that names the repository and opens its page — plus that page, which lists one repository and nothing else. The page is read the way the list it was opened from reads that repository: the store's lists everything published, uncapped; the installed list's opens on the installs on disk, with the rest of the catalogue behind one control at the foot of the list |
| `src/pages/explore/live-groups.ts` | The live skills.sh answer re-filed by repository, for the store list's repository unit: buckets the deduped hits by their `owner/repo`, keeping the endpoint's own relevance order for the buckets and each bucket's skills most-installed first. The unit switch decides what the live section is made of — repository cards here (capped at the reader's preview limit like any card), one flat row per skill in the skill unit. A live card's bar leads wherever the repository's catalogue lives: the store's own page when the index carries the repository, skills.sh when it does not, and no door at all for a bare discovery domain |
| `src/lib/view-memory.ts` / `src/hooks/use-view-memory.ts` / `use-return.ts` | A list page's view — its controls, its revealed depth, its scroll position — remembered per history entry, because a page that owns its own scrolling element is a page the browser restores nothing for. `use-return.ts` is the app's back control: it pops that entry rather than pushing a fresh copy of its path, which is what makes the memory worth having |
| `src/lib/avatar-source.ts` | The single answer to where an owner's avatar lives: the dataset mirror at the pinned snapshot tag, then its mutable branch, then GitHub's own endpoint — every surface draws from this one chain |
| `src/lib/tauri.ts` | Detects whether the app runs inside the Tauri WebView |
| `src/lib/open-external.ts` | Opens external links in the system browser (Tauri needs the opener plugin) |
| `src-tauri/tauri.conf.json` | Window, build, and packaging configuration |
| `src-tauri/capabilities/default.json` | Permission declarations for the main window (`core:default`, `opener:default`, `updater:default`, `process:allow-restart`, and the skills.sh search origin for `http:default`) |

## Data Flow Examples

**Installing a skill**:

1. The user clicks "Install" on the explore page.
2. `local-skills.installSkillFromSource(repo, name)` checks the environment and composes the source `owner/repo@<skill>`.
3. Tauri environment → `skills-manager.installSkill` → `invoke("install_skill", ...)` → Rust `install_skill` command → `agents-skills::Manager.add` (the GitHub API downloads only the matched skill directory).
4. When finished, the frontend refreshes the `installed-skills` query cache.
5. Browser environment → writes via `mock-local.installMockSkill`.

**Browsing the skill list**:

1. The registry lives in a lazily spawned worker (`lib/registry/worker.ts` behind the `lib/registry/client.ts` proxy): the main thread only ever receives a grouped answer, a capped search reply and pushed progress, never the multi-megabyte index.
2. On boot the worker reads the parsed index from IndexedDB (`lib/registry/cache.ts`) and serves it immediately — cold start paints from cache with no network wait.
3. It then reads the `latest` pointer for the published tag and probes `upstream/stats.json` for the run stamp, both cache-busted so no cached copy can make an old snapshot look current. Same stamp as the cached one: the multi-megabyte body is not downloaded at all.
4. Otherwise `registry/index-stream.ts` streams `skills.jsonl` **addressed at that tag** (immutable, so a CDN copy is always the right bytes), parsing each line as it arrives; pages render from the partial list right away. A partial list is always a prefix of the final one in registry order, so paging stays stable while the count climbs — but the list is ordered by install count, so its first page is a best-so-far slice and early rows move down as the stream delivers more skills.
5. Search waits for the whole dataset: the MiniSearch index (built by `lib/search-index.ts`, see step 9) is created once the stream completes (rebuilding it per snapshot would cost more than the download itself), and the search field stays locked until the worker reports `ready`. A query is therefore never answered over a partial registry — the worker returns nothing before the index exists, as a backstop to the disabled field.
6. The landed dataset overwrites the IndexedDB record together with its identity (tag, run stamp).
7. `cdn-config.ts` tries the configured CDN, direct GitHub and the default CDN in order; a source that fails mid-stream hands over to the next and restarts the parse.
8. The announced identity reaches the main thread through the client snapshot, where Settings shows which snapshot is in use and whether this launch reused the local cache. Only what the pages asked for — a grouped answer, a search reply — is kept in the TanStack Query memory cache; the registry itself is not duplicated there.
9. Ordering has one rule and one exception: the browsed list has one shape — one card per repository, most-starred first, with each repository's skills in the browse order — while a search is always answered in relevance order. A query re-answers the list's *order*, never its layout, and there is no control on the page that could claim otherwise. The ranking described below is the skill registry's own. That order is: every query term must match, with no fallback to any term; exact and prefix name hits rank first, ordered among themselves by install count — a name match already settles *what* the skill is, so among namesakes installs are the difference that matters; the remaining name hits (terms carried without starting the name) follow, ordered by install count with the BM25 score as the final tie-break.

What counts as a match has one definition, in `lib/search-index.ts`, used by the two remaining searchable lists (the skill registry and the installed skills): every query term must equal an indexed term or be the start of one, and nothing else is forgiven — a mistyped word, a fragment from the middle of a word, or a term only some other document carries does not count. Prefix matching is kept because a half-typed word is an unfinished query rather than a wrong one. Tokenization is MiniSearch's own — split on whitespace and punctuation, then lowercase — which is all the one indexed field needs: a skill's name is an ASCII slug. (The rows highlight a matched term wherever it occurs, so a term inside a longer word is marked too.)
