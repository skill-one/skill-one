# Development

[English](development.md) | [简体中文](development.zh-CN.md)

Build, tech stack, architecture, testing, and release notes for developers. For user-facing docs, see the [README](../README.md).

## Tech Stack

| Layer          | Technology                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Desktop runtime | [Tauri v2](https://v2.tauri.app/) + Rust                                                        |
| UI             | [React 19](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/) (Radix UI + Tailwind CSS)  |
| Routing        | [react-router v7](https://reactrouter.com/) (HashRouter)                                        |
| Data fetching  | [TanStack Query v5](https://tanstack.com/query) (persisted to localStorage)                     |
| Build          | [Vite 8](https://vite.dev/) + TypeScript 7.0                                                    |
| Testing        | [Vitest 4](https://vitest.dev/) + Testing Library                                               |

## Prerequisites

- **Node.js** (≥ 18) and [pnpm](https://pnpm.io/) (the version is pinned by the `packageManager` field in `package.json`)
- **Rust** toolchain, `rustc >= 1.88`
- **Tauri system dependencies**: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Quick Start

```bash
pnpm install         # Install dependencies
pnpm dev             # Frontend only (browser mode, in-memory mock data)
pnpm tauri dev       # Launch the desktop app (Tauri dev mode)
pnpm test:run        # Run tests once
pnpm tauri build     # Build release packages
```

## Common Scripts

| Command                                         | Description                                       |
| ----------------------------------------------- | ------------------------------------------------- |
| `pnpm dev`                                      | Start the Vite dev server (port 5173)             |
| `pnpm dev:test`                                 | Second desktop dev instance on port 5273, so test/dev sessions never occupy the main 5173 port |
| `pnpm build`                                    | Type check + frontend build                       |
| `pnpm typecheck`                                | Run the TypeScript type check only                |
| `pnpm preview`                                  | Preview the build output                          |
| `pnpm tauri dev`                                | Launch the desktop app (dev mode)                 |
| `pnpm tauri build`                              | Package the desktop app                           |
| `pnpm test` / `test:run` / `test:coverage`      | Watch mode / single run / coverage tests          |

## Project Structure

```
skill-one/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # Components shared across pages
│   │   ├── ui/             # shadcn/ui components
│   │   ├── app-sidebar.tsx # Sidebar navigation (shared by routes + title bar)
│   │   ├── agent-icon.tsx  # Agent brand icons
│   │   ├── owner-avatar.tsx# Repository avatar
│   │   ├── skill-detail/    # Shared skill detail panel + modal drawer
│   │   └── placeholder.tsx # Shared "nothing to show" empty state for list pages
│   ├── pages/              # Page-level components, grouped per page (with private subcomponents and tests)
│   │   ├── explore/        # Store explore pages (skill-list-row / skill-install-button)
│   │   │   └── featured/   # Curated featured page (hero leaderboards + category sections)
│   │   ├── my-skills/      # My Skills page (agent-icon-grid / agent-icon-button / link-confirm-dialog, etc.)
│   │   └── settings/       # Settings page
│   ├── hooks/              # Custom hooks
│   ├── lib/                # API / business logic layer
│   ├── types/              # Type definitions
│   ├── data/               # Static data (test mock index + curated featured categories)
│   ├── test/               # Test utilities and setup
│   ├── App.tsx             # Routing and layout
│   └── main.tsx            # Entry point
├── src-tauri/              # Backend (Rust + Tauri)
│   ├── src/                # Tauri commands (install/list/remove/link, etc.)
│   ├── capabilities/       # Permission declarations
│   └── tauri.conf.json     # Tauri configuration
├── components.json         # shadcn/ui configuration
└── vite.config.ts          # Vite + Vitest configuration
```

## Architecture

The app follows a layered split: "frontend reads, backend writes":

- **Reads**: The skills registry index and each skill's `SKILL.md` are fetched directly by the frontend through the configurable download source (direct GitHub or a CDN mirror) and cached in TanStack Query.
- **Writes**: Skill installation, updates, and uninstallation, as well as agent-directory linking/migration, are all delegated through Tauri commands to the `agents-skills` library on the Rust side.
- **Browser fallback**: In a pure browser environment (dev server / tests), write operations fall back to in-memory mocks so the UI remains fully explorable.

For details see [`architecture.md`](architecture.md); for the `agents-skills` API used by the backend see [`agents-skills-api.md`](agents-skills-api.md); for the format and usage of the store registry index see [`index-format.md`](index-format.md).

## Theming

The app supports light, dark, and system-following appearance, switchable from the **Settings → Appearance** card.

shadcn/ui ships the dark palette out of the box: `src/index.css` defines both a `:root` and a `.dark` set of oklch variables plus the `@custom-variant dark (&:is(.dark *))` rule, and every component under `src/components/ui/` reads semantic tokens. Supporting dark mode is therefore only a matter of toggling the `dark` class on `<html>` — which is what [next-themes](https://github.com/pacocoursey/next-themes) does:

- `src/components/theme-provider.tsx` — the single shared configuration (`attribute="class"`, `defaultTheme="system"`, `enableColorScheme`, `storageKey="skill-one-theme"`), also responsible for mirroring the theme onto the native window.
- `src/components/theme-mode-toggle.tsx` — the three-way `ToggleGroup` on the settings page.
- `src/hooks/use-native-theme.ts` — calls `getCurrentWindow().setTheme()` inside Tauri so OS-drawn surfaces (title bar, scrollbars, form controls, the tray popover's glass material) follow along. `system` maps to `null`, leaving that case to the OS. On macOS `set_theme` is app-wide, so the main window's call covers every window.

Only `src/main.tsx` (main window) mounts the provider. The menu bar popover (`src/popover/popover-main.tsx`) deliberately uses no theme provider: `src/popover/popover.css` re-tokens the shadcn variables for that document with translucent system colors (label / secondary label / fills / hairline separators) driven by `prefers-color-scheme` — the same appearance source the native glass material behind the transparent window resolves from, so content and backdrop can never disagree about light or dark.

Conventions when styling new UI:

- Use semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`) rather than raw palette colors, so a theme switch needs no per-component work.
- A raw color is acceptable only when it sits on a brand gradient or image that reads the same in both themes (for example the featured page hero).
- Where a raw color is unavoidable (status text such as `text-emerald-600`), pair it with a `dark:` variant.

## Testing

Tests use Vitest + Testing Library and run in the `jsdom` environment. Component tests and unit tests under `src/lib` follow the "one file, one `*.test.ts(x)`" convention and can be run in one go with `pnpm test:run`.

## Isolated Worktrees

New work happens in a `git worktree` under `.worktrees/` so the checkout on
`main` keeps running, and a dev server there must never take port 5173 (that is
`main`'s, and it runs with `strictPort`) — use `pnpm dev:test` on 5273.

Two setup details save real time:

- **Install dependencies for real.** Symlinking the main checkout's
  `node_modules` makes `pnpm build` fail, because pnpm first runs an install
  precheck the symlinked tree does not satisfy. A plain `pnpm install` in the
  worktree keeps `pnpm build`, `pnpm typecheck` and CI behaving identically.
- **Share the Rust build cache.** `src-tauri/target` is tens of gigabytes, so
  point cargo at the main checkout instead of recompiling the world per
  worktree: `CARGO_TARGET_DIR=<repo>/src-tauri/target cargo check`. Do not run
  `cargo clean` with that variable set — it deletes the main checkout's cache
  too; unset it first, or scope the cleanup to the worktree's own target.

## Release

Cutting a release is one annotated tag — see [auto-update.md](auto-update.md) for the full procedure and the published artifacts. In short:

1. **Bump the version** in every field that must match — step 1 of [auto-update.md](auto-update.md) lists them and carries the commit command.
2. **Commit and tag**: `chore(release): bump version to X.Y.Z`, then `git tag -a vX.Y.Z -m "vX.Y.Z"`.
3. **Push**: `git push origin main`, then push the tag — pushing a `v*` tag is what triggers the build.

[GitHub Actions](../.github/workflows/release.yml) builds on `macos-14` (arm64) and publishes the `.dmg`, the minisign-signed `Skill One.app.tar.gz` plus the `latest.json` manifest the in-app updater reads, and the SHA256-checked `skill-one.rb` cask in [skill-one/homebrew-tap](https://github.com/skill-one/homebrew-tap).

> The app is distributed ad-hoc signed; on first launch of a manually downloaded macOS build, allow it under "System Settings → Privacy & Security". From v0.2.0 onward, installs update themselves in-app.
