# Testing

[English](testing.md) | [简体中文](testing.zh-CN.md)

How this project is tested, and why each layer exists. For build, architecture
and release notes see [development.md](development.md); for user-facing docs see
the [README](../README.md).

## The layers

Five layers, each covering something the others cannot. The point of listing
them is not the count but the gaps: where a claim is made twice, or not at all.

| Layer | Tool | Command | Covers |
| --- | --- | --- | --- |
| Unit / component | [Vitest](https://vitest.dev/) + Testing Library (jsdom) | `pnpm test:run` | Logic and components in isolation |
| Coverage gate | Vitest (`@vitest/coverage-v8`) | `pnpm test:coverage` | Enforces the thresholds in `vite.config.ts` |
| Frontend ↔ backend contract | Vitest | part of `pnpm test:run` | Command names, argument keys and return shapes across the Tauri boundary |
| Command logic | `cargo test` (Rust) | `cd src-tauri && cargo test` | The ten `skills.rs` commands, against a sandboxed `Manager` |
| End to end | [Playwright](https://playwright.dev/) | `pnpm test:e2e` | The assembled app in a browser: routing, layout, focus order, CSS |
| Accessibility | axe-core, via `src/test/a11y.ts` | part of `pnpm test:run` | Roles, names and relationships on the custom interactive components |

Every one of these runs in CI. The coverage gate is the same `test:coverage`
command developers run locally — the thresholds in `vite.config.ts` are only
worth writing if something executes them.

## The Tauri boundary, from both sides

`src/lib/skills-manager.ts` is the only place the frontend crosses into Rust,
and the two sides never check each other: the command names are string literals
in `invoke("…")` calls, and the Rust side is a list of `#[tauri::command]`
functions. Nothing spanned that gap until two suites were added, one per side.

**The call side** (`src/lib/skills-manager.test.ts`) pins every export to the
exact argument list it hands to `invoke`. Not just the command name — Tauri
matches the JS object's keys against the Rust function's parameter names, so a
mismatch is a runtime "invalid args" that no type in the project would catch.

**The return side** (`src-tauri/src/skills.rs`) asserts each DTO's serialized
keys. Those shapes are mirrored by hand-written TypeScript interfaces, and
`#[serde(rename_all = "camelCase")]` is the only thing keeping the two
spellings together, so `internal_skills` drifting from `internalSkills` would
otherwise reach the UI as a silently `undefined` field.

**The logic in between** is reachable because each command delegates to a
`*_in(&Manager, …)` function. The `#[tauri::command]` wrapper stays a one-line
delegation, and `run_blocking` is deliberately untested: it owns a
`spawn_blocking` hop and resolves the real `~/.agents`, and the tests build a
sandboxed `Manager` instead:

```rust
Manager::builder()
    .home(root)          // a tempfile, never the real home
    .config(root)
    .cwd(root)
    .probe_system_dirs(false)  // no probing /Applications, so it is hermetic
    .build()
```

Collapsing the three copies of the name-to-directory lookup into one
`resolve_skill_dir` was a side effect of that refactor, and it is the piece
worth having tested: resolving a name against a real scan instead of
interpolating it into a path is what makes a frontend-supplied `../..` resolve
to nothing.

## End-to-end tests, and what they deliberately do not cover

`pnpm test:e2e` drives the **web** build on port 5274 — not 5173, which is the
developer's own dev server, and not 5273, which belongs to the Tauri dev-test
config.

It is one test, and that is a considered number rather than a starting point.

The jsdom suite cannot see whether the app is *operable*. It replaces the
document, so nothing is hit-tested, nothing is laid out, nothing has to be
clickable. That gap was not hypothetical: the header centres its brand mark
with an `absolute inset-0` wrapper, and that wrapper painted over the nav and
swallowed every click on it. The app was unusable — no navigation at all —
while all fourteen header component tests stayed green. A single click test
catches that class of bug, and it is the only assertion in the suite that a
browser can make and jsdom cannot.

Everything a browser *could* say that the fast suite already says was removed.
The drawer's Escape dismissal, focus and Enter, the catch-all redirect, and
nested-control validity all have faster tests that make the same claim:
`skill-detail-panel.test.tsx`, `App.test.tsx`, and axe in `src/test/a11y.ts`.
Screenshot baselines went the same way — two committed images to maintain, a
platform- and font-version-sensitive comparison, and no bug class that the click
does not already surface.

What this layer does **not** do is exercise the Tauri commands. In a browser
`isTauri()` is false, so every install, removal and link goes through
`lib/mock-local` and the Rust side is never reached. That gap is covered from
the other two directions instead — the call side and the command logic above —
so no single test crosses the boundary and the contract is still pinned from
both ends.

Driving the real Rust backend from a browser test is not available on macOS:
`tauri-driver` supports Windows and Linux only, and Tauri's documented macOS
route (`@wdio/tauri-service` with `driverProvider: "embedded"`) requires
adding `tauri-plugin-wdio-webdriver` and `tauri-plugin-wdio` to the
application — test hooks inside the shipped binary. That trade was declined;
see the commit history for the discussion.

## Coverage policy

The thresholds live in `vite.config.ts` and are enforced by `pnpm test:coverage`.
There is a global floor plus four per-glob floors:

| Group | Floor | Why it differs |
| --- | --- | --- |
| global | 84 / 80 / 82 / 86 | A couple of points under the current figures |
| `src/lib/*.ts` | 88 / 82 / 87 / 90 | Core logic and the Tauri boundary — a drop here is a regression whatever the total says |
| `src/lib/registry/**` | 78 / 78 / 70 / 79 | Streaming, cache and worker plumbing: I/O-bound and largely driven through `worker-controller` |
| `src/hooks/**` | 93 / 86 / 91 / 95 | React state, where an uncovered branch is a stale render |
| `src/components/ui/**` | 62 / 72 / 66 / 62 | Upstream shadcn/Base UI wrappers, taken unmodified by project policy — a floor, not a target |

The groups are deliberately non-overlapping (`src/lib/*.ts` stops at the
directory boundary rather than also matching `src/lib/registry`), so no file is
held to two bars at once. Vitest counts glob-matched files into the global
total as well, so the groups add floors rather than replacing the global one.

`src/lib/mock-local.ts` is excluded. The comment in the config used to say it
"never ships", which was wrong: `lib/local-skills` imports it statically and
serves the browser build through it whenever `isTauri()` is false. It is
excluded as a test double, not as dead code.

## What jsdom cannot decide

Two things are worth knowing before writing assertions here.

**There is no CSS engine.** `getComputedStyle` reports `position: static`
whatever the stylesheet says, so a Tailwind utility class cannot be verified
through rendered geometry. Where a test needs to pin a utility class, the
class *is* the available evidence, and the comment should say so. This is why
a few such assertions remain in `repo-card.test.tsx` and `explore-page.test.tsx`
— the alternative would be asserting nothing.

**`incomplete` axe results are not failures.** jsdom runs no layout, so rules
depending on geometry or painted pixels — colour contrast above all — cannot
be decided and come back incomplete. `src/test/a11y.ts` ignores them and
enforces the statically decidable half, which is the part a hand-written query
misses.

## Conventions

- One `*.test.ts(x)` per source file, colocated.
- Query by role and accessible name. `getByTestId` appears in the source
  nowhere; a `data-testid` survives a rewrite of the thing it names.
- `container` for queries into the render, `baseElement` for portals, and
  `document` for neither.
- One claim per `it`, named as the claim. A test whose title joins two things
  with "and" is two tests.
- No snapshots for behaviour. The only committed images are the visual
  regression baselines, which are pictures of the app.