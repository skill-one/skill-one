# Architecture

[English](architecture.md) | [简体中文](architecture.zh-CN.md)

## Overview

Skill One is a desktop app built on Tauri v2. The frontend (React 19) handles presentation and data retrieval, while the backend (Rust + `agents-skills`) handles local filesystem operations and agent skill directory linking.

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend (WebView)              │
│  components / hooks / lib / pages                       │
│   ├── Read: lib/registry/, worker.ts, search-index.ts   │
│   │         └─ CDN Mirrors (jsDelivr / JSDMirror)       │
│   ├── State: TanStack Query v5 + IDB + LocalStorage     │
│   └── Write: local-skills.ts ──► skills-manager.ts      │
│                                 └─ invoke (Tauri IPC)   │
└──────────────────────────┬──────────────────────────────┘
                           │ Tauri IPC
┌──────────────────────────▼──────────────────────────────┐
│                   Rust Backend (src-tauri)              │
│   skills.rs: install / remove / enable / link           │
│   dir_fingerprint.rs: stat-only change detection        │
│   provenance.rs: metadata ledger (.skill-one.json)      │
│   activity.rs: append-only audit log                    │
│   └─ agents-skills crate                                │
└─────────────────────────────────────────────────────────┘
```

## Division of Responsibilities

### 1. Frontend (Reads & Search)

- **`src/lib/registry/`**: Background registry service. A dedicated Web Worker (`worker.ts`) downloads and streams `skills.jsonl` from CDN mirrors, parsing records chunk-by-chunk into IndexedDB without blocking the main UI thread.
- **`src/lib/search-index.ts`**: High-performance client-side full-text search powered by MiniSearch over skill slugs and metadata.
- **`src/lib/cdn-config.ts`**: Fallback download source chain: direct GitHub → JSDMirror / jsDelivr mirrors → custom configured CDN.
- **Query Persistence**: Persistent caching via TanStack Query and IndexedDB ensures instantaneous offline start and background revalidation.

### 2. Backend (System & Filesystem)

- **`src-tauri/src/skills.rs`**: Exposes Tauri commands for local skill lifecycle management delegating to `agents-skills::Manager`. Blocking operations run on thread pools via `spawn_blocking`.
- **`src-tauri/src/dir_fingerprint.rs`**: Stat-only recursive directory fingerprint (`mtime` + `size`) providing instant change-detection without reading file contents.
- **`src-tauri/src/provenance.rs`**: Atomic reads and writes for the provenance manifest at `~/.agents/skills/.skill-one.json`.
- **`src-tauri/src/activity.rs`**: Append-only audit logger at `<app_log_dir>/activity.jsonl` with automatic 2 MiB rotation.

### 3. Browser Fallback

When running in browser environments (`pnpm dev` or Vitest), `isTauri()` returns `false` and `local-skills.ts` seamlessly redirects calls to in-memory mocks (`mock-local.ts`).

## Core Modules

| Module / Path | Responsibility |
| :--- | :--- |
| `src/App.tsx` | App shell, HashRouter, query persistence, and auto-refresh workers |
| `src/pages/agents/` | Home view: Agent dependency graph, link toggles, and status ribbons |
| `src/pages/explore/` | Store view: Catalog browsing, search results, and repository cards |
| `src/pages/installed/` | Installed skills view: Custom tagging, time-bucketing, and bulk actions |
| `src/pages/installed/installed-grouping.ts` | Pure functions for sorting, time-bucketing, and section generation |
| `src/pages/installed/use-installed-bulk-actions.ts` | Hook encapsulating multi-selection, batch toggling, tagging, and linking |
| `src/components/skill-detail/` | Drawer & panel for Markdown preview, editing (CodeMirror 6), and tags |
| `src/components/list-toolbar.tsx` | Unified toolbar for search queries, layout units (card/row/grid), and sorting |
| `src/lib/provenance.ts` | Client-side reconciliation and schema handling for `.skill-one.json` |

## Data Flows

- **Skill Installation**: User triggers install → `local-skills.ts` passes `owner/repo/slug` → Tauri command `install_skill` invokes `agents-skills` → repository tarball downloaded & extracted → React Query cache invalidated → activity log entry appended.
- **Registry Synchronization**: App boot → Worker reads IndexedDB cache → cache-busted `HEAD` check on snapshot ETag → if updated, streams SHA-pinned `skills.jsonl` in chunks → parses into IndexedDB and builds MiniSearch index.
