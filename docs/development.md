# Development

[English](development.md) | [简体中文](development.zh-CN.md)

Build, tech stack, architecture, testing, and release notes for developers. For user-facing docs, see the [README](../README.md).

## Tech Stack

| Layer          | Technology                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Desktop runtime | [Tauri v2](https://v2.tauri.app/) + Rust                                                        |
| UI             | [React 19](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/) (Base UI + Tailwind CSS)  |
| Routing        | [react-router v8](https://reactrouter.com/) (HashRouter)                                        |
| Data fetching  | [TanStack Query v5](https://tanstack.com/query) (persisted to localStorage)                     |
| Build          | [Vite 8](https://vite.dev/) + TypeScript 7.0                                                    |
| Testing        | [Vitest 4](https://vitest.dev/) + Testing Library                                               |

## Prerequisites

- **Node.js** (≥ 24, the active LTS — see `.nvmrc`) and [pnpm](https://pnpm.io/) (the version is pinned by the `packageManager` field in `package.json`)
  - The floor is not arbitrary: Vite 8 requires Node 20.19+/22.12+, and react-router v8 requires Node 22.22+ while only supporting the *latest minor* of a maintenance-LTS line. Node 24 is the active LTS, so it is the version CI and local development both target. `package.json` declares this as `engines.node` (a warning, not a hard gate — add `engine-strict=true` to `.npmrc` to enforce it).
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
| `pnpm lint` / `lint:fix`                        | Lint (syntax-only rules) / with autofix           |
| `pnpm lint:types`                               | Lint with the type-aware rules (needs a type graph, so slower) |

## Project Structure

```
skill-one/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # Components shared across pages
│   │   ├── ui/             # shadcn/ui components
│   │   ├── app-header.tsx  # The app's chrome, one row: centred brand + the list's controls
│   │   ├── app-rail.tsx    # The app's navigation: a narrow rail (destinations, settings)
│   │   ├── drill-down-head.tsx # A page inside a list, as its head: the way back + the entity
│   │   ├── list-facets.tsx # The scope chips opening a list's content (+ the 更多 flyout)
│   │   ├── list-toolbar.tsx # The search field (row's head) + unit switch (row's tail) both lists share
│   │   ├── agent-icon.tsx  # Agent brand icons
│   │   ├── owner-avatar.tsx# Owner avatar (the metadata rail's author chip)
│   │   ├── repo-hover-card.tsx # Author chip + its repository hover card
│   │   ├── skill-cover.tsx # Skill's own image slot (author initial; detail drawer only)
│   │   ├── skill-detail/    # Shared skill detail panel + modal drawer
│   │   ├── settings-popover.tsx # Settings flyout anchored to the rail's foot
│   │   ├── advanced-settings-dialog.tsx # Second-level settings (CDN base + data source)
│   │   └── placeholder.tsx # Shared "nothing to show" empty state for list pages
│   ├── pages/              # Page-level components, grouped per page (with private subcomponents and tests)
│   │   ├── explore/        # Store explore pages (skill-row + skill-run / repo-card + repo-page / group-section / live-groups / search-results)
│   │   └── my-skills/      # My Skills page (agent avatar menu / agent-link-settings-dialog, etc.)
│   ├── hooks/              # Custom hooks
│   ├── lib/                # API / business logic layer
│   ├── types/              # Type definitions
│   ├── data/               # Static data (domain key → label/emoji taxonomy)
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
- **Writes**: Skill installation and uninstallation, as well as agent-directory linking, are all delegated through Tauri commands to the `agents-skills` library on the Rust side.
- **Browser fallback**: In a pure browser environment (dev server / tests), write operations fall back to in-memory mocks so the UI remains fully explorable.

For details see [`architecture.md`](architecture.md); for the `agents-skills` API used by the backend see [`agents-skills-api.md`](agents-skills-api.md); for the format and usage of the store registry index see [`index-format.md`](index-format.md).

## Theming

The app supports light, dark, and system-following appearance, switchable from the **Appearance section of the settings popover**.

shadcn/ui ships the dark palette out of the box: `src/index.css` defines both a `:root` and a `.dark` set of oklch variables plus the `@custom-variant dark (&:is(.dark *))` rule, and every component under `src/components/ui/` reads semantic tokens. Supporting dark mode is therefore only a matter of toggling the `dark` class on `<html>` — which is what [next-themes](https://github.com/pacocoursey/next-themes) does:

- `src/components/theme-provider.tsx` — the single shared configuration (`attribute="class"`, `defaultTheme="system"`, `enableColorScheme`, `storageKey="skill-one-theme"`), also responsible for mirroring the theme onto the native window.
- `src/components/theme-mode-toggle.tsx` — the three-way `ToggleGroup` in the settings popover.
- `src/hooks/use-native-theme.ts` — calls `getCurrentWindow().setTheme()` inside Tauri so OS-drawn surfaces (title bar, scrollbars, form controls, the tray popover's glass material) follow along. `system` maps to `null`, leaving that case to the OS. On macOS `set_theme` is app-wide, so the main window's call covers every window.

Only `src/main.tsx` (main window) mounts the provider. The menu bar popover (`src/popover/popover-main.tsx`) deliberately uses no theme provider: `src/popover/popover.css` re-tokens the shadcn variables for that document with translucent system colors (label / secondary label / fills / hairline separators) driven by `prefers-color-scheme` — the same appearance source the native glass material behind the transparent window resolves from, so content and backdrop can never disagree about light or dark.

Conventions when styling new UI:

- Use semantic tokens (`bg-background`, `text-muted-foreground`, `border-border`) rather than raw palette colors, so a theme switch needs no per-component work.
- A raw color is acceptable only when it sits on a brand gradient or image that reads the same in both themes.
- Where a raw color is unavoidable (status text such as `text-emerald-600`), pair it with a `dark:` variant.

## Components

`src/components/ui/` holds [shadcn/ui](https://ui.shadcn.com/) components from the `new-york` style of the Tailwind v4 registry. Add or refresh one with:

```bash
pnpm dlx shadcn@latest add <component>
```

Two conventions matter when touching them:

- **Import `cn` from the `cn` package** — `import { cn } from "cn"` — not from `@/lib/utils`. This is what the registry emits, so a newly added component needs no import fixup. `src/lib/utils.ts` still re-exports `cn` to match the shadcn `utils` registry item, but new code should not route through it.
- **`add` overwrites.** Several components carry deliberate local changes: `badge` adds a `success` variant, `drawer` widens to 600px, `card` retunes its density. Review `git diff` after any `add` instead of assuming the file is registry-fresh.

## Testing

Two layers, each covering what the other cannot:

| Layer | Tool | Command | Covers |
| --- | --- | --- | --- |
| Unit / component | Vitest + Testing Library (jsdom) | `pnpm test` / `test:run` | Pure logic and components in isolation |
| Coverage gate | Vitest (`@vitest/coverage-v8`) | `pnpm test:coverage` | Enforces the thresholds in `vite.config.ts` |

Component tests and unit tests under `src/lib` follow the "one file, one `*.test.ts(x)`" convention and can be run in one go with `pnpm test:run`.

## Content Security Policy

`src-tauri/tauri.conf.json` sets `app.security.csp`. Without it the app ships with no policy at all; with it the WebView refuses anything the directives do not allow. Tauri appends nonces and hashes for bundled code at build time.

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Everything not named below comes from the bundle. |
| `script-src` | `'self'` | No inline and no `eval` — Tauri nonce-matches the bundled scripts. |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind emits a stylesheet, but React sets inline `style` attributes. |
| `img-src` | `'self' https: data: blob:` | Skill covers, owner avatars and images inside `SKILL.md` are remote by nature. |
| `font-src` | `'self' data:` | Inlined font subsets. |
| `worker-src` | `'self' blob:` | The registry worker is a bundled ES module; `blob:` covers an inlined one. |
| `connect-src` | `'self' ipc: http://ipc.localhost https: http://localhost:* http://127.0.0.1:*` | `ipc:` is Tauri's command channel; `https:` is the registry, `SKILL.md` fetches and avatars; the loopback entries let a self-hosted mirror sit on plain HTTP. |

Two things to keep in mind when editing it:

- **`https:` in `connect-src` is deliberate but broad.** The download source is user-configurable in Settings, so the host set is not known at build time. A custom CDN on plain HTTP outside loopback will be blocked — tighten this only together with a matching validation on that field.
- **The CSP only exists in the packaged app.** In dev (`pnpm dev`) the page comes from the Vite server, which sets no policy. There is no automated test that attaches it today — verify CSP changes against a `pnpm tauri build` output.

Rendering remote `SKILL.md` content is a separate question from the CSP: `react-markdown` is configured without `rehype-raw`, so raw HTML in the source is never rendered, and link/image URLs are resolved against a scheme allowlist (`src/components/markdown.tsx`). The CSP is the backstop, not the primary defence.

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
