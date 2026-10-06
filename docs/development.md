# Development Guide

[English](development.md) | [简体中文](development.zh-CN.md)

Developer instructions for setup, architecture, testing, and building Skill One. For user documentation, see the [README](../README.md).

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Desktop Runtime** | [Tauri v2](https://v2.tauri.app/) + Rust |
| **Frontend Framework** | [React 19](https://react.dev/) + TypeScript |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com/) (`@base-ui/react` primitives + Tailwind CSS v4) |
| **Routing** | [react-router v8](https://reactrouter.com/) (HashRouter) |
| **State & Cache** | [TanStack Query v5](https://tanstack.com/query) + IndexedDB + LocalStorage |
| **Text Search** | [MiniSearch](https://lucaong.github.io/minisearch/) |
| **Build Tooling** | [Vite 8](https://vite.dev/) + [oxlint](https://oxc.rs/) |
| **Testing** | [Vitest](https://vitest.dev/) + Testing Library + Playwright |

## Prerequisites

- **Node.js**: ≥ 24 (see `.nvmrc`) with [pnpm](https://pnpm.io/) (v12+).
- **Rust**: `rustc >= 1.88`.
- **Tauri System Dependencies**: Follow the [Tauri setup guide](https://v2.tauri.app/start/prerequisites/).

## Quick Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Web-only preview (in-memory mock mode)
pnpm tauri dev        # Run native desktop app in dev mode
pnpm typecheck        # TypeScript validation
pnpm lint             # Fast linting via oxlint
pnpm test:run         # Run unit tests once
pnpm tauri build      # Production desktop packaging
```

## Project Structure

```
skill-one/
├── src/                    # Frontend (React 19 + TypeScript)
│   ├── components/         # Shared components
│   │   ├── ui/             # shadcn/ui components (button, dialog, card, etc.)
│   │   ├── app-header.tsx  # Top header with navigation and settings
│   │   ├── list-toolbar.tsx# List search, view layout toggles, and sort controls
│   │   ├── skill-detail/   # Skill details drawer, Markdown preview & editor
│   │   └── settings-menu.tsx # Settings popover (CDN source, updates, logs)
│   ├── pages/              # Primary route views
│   │   ├── agents/         # Agents topology graph and link toggles (Home)
│   │   ├── explore/        # Store / Explore catalog and search results
│   │   └── installed/      # Installed skills management, grouping, and bulk actions
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Client services, registry worker, and Tauri IPC bridges
│   ├── data/               # Static mappings and taxonomies
│   ├── App.tsx             # Main routing, layout, and query providers
│   └── main.tsx            # Web entry point
├── src-tauri/              # Native backend (Rust)
│   ├── src/                # Tauri commands (skills, provenance, activity, etc.)
│   ├── capabilities/       # Security permission declarations
│   └── tauri.conf.json     # App window and packaging configurations
├── docs/                   # Architecture and technical documentation
└── website/                # Official website (Astro)
```

## Documentation Map

- [Architecture & Data Flows](architecture.md)
- [Skill Provenance Specification](skill-provenance.md)
- [Activity Audit Log](activity-log.md)
- [Testing Architecture](testing.md)
- [Auto-Update Mechanism](auto-update.md)
- [SKILL.md In-place Editing](editing-skills.md)
