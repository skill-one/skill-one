# Agent Icons

Where agent brand icons come from, and how they reach the screen.

## Source: the `agents-info` dataset, vendored

Agent icons are **vendored into this app** from the
[`skill-one/agents-info`](https://github.com/skill-one/agents-info) dataset
repo:

- `agents.jsonl` — one JSON record per agent; the `name` field is the key the
  app resolves icons with, the `icon` field points at the artwork.
- `icons/` — the icon files themselves (SVG and PNG). Variant agents
  (region-locked or CLI editions) share their parent brand's file.

`scripts/sync-agents-info.mjs` (`pnpm sync:agents`) copies both into the
repo — the manifest as `public/agents/agents.jsonl`, the files as
`public/agents/icons/` — and generates
`src/data/agent-icons.generated.ts` with the `name → icon` map plus each
icon's precomputed edge color. Launches are fully offline: no dataset
download, no runtime color analysis, no CORS-sensitive canvas reads.

A new agent (or a redrawn logo) needs an app update: re-run
`pnpm sync:agents` and commit the refreshed `public/agents/` copy together
with the regenerated table.

## Loading pipeline

1. `hooks/use-agent-icons.ts` resolves one agent against the generated map,
   synchronously — no fetch, no cache, no background refresh.
2. Each icon resolves to a single local candidate:
   - repo-relative (`icons/codex-color.svg`) → `/agents/icons/codex-color.svg`
     from the app's own bundle (`public/agents/`);
   - absolute https URL → the URL itself, as its own single candidate.

`AgentIcon` (`components/agent-icon.tsx`) falls back to a generic Bot glyph
when no dedicated icon is available — unknown agent or null icon (the
built-in catch-all agent).

## Ribbon edge colors

The agent graph's ribbons (`pages/agents/agent-graph.tsx`) warm from hub
gray to the average color of the agent's own icon at its tile. The average
is **precomputed, not measured at render**: the sync script rasterizes each
icon (max 100px per side) and applies the same `sqrt` average
`fast-average-color` used to compute at runtime, writing one hex per file
into the generated table. `hooks/use-agent-edge-color.ts` is a synchronous
lookup over that table — the former `fast-average-color` dependency is gone,
and icons that cannot color a ribbon (monochrome glyphs, unknown files)
resolve to `undefined` so their ribbons stay neutral.

## Rendering traits

Some artwork needs special handling that the dataset does not describe.
These live in a small `FILE_TRAITS` table in `lib/agent-icons.ts`, **keyed by
the icon path** (the dataset's `icon` value) rather than by agent name, so
the traits travel with the artwork when the dataset re-points a variant at
another brand's file:

- `mono` — a monochrome `currentColor` glyph that renders black as an
  `<img>`; inverted to white in dark mode (Cline, Copilot, Windsurf, …).
- `ground` — surface-bound artwork painted on a fixed contrasting ground in
  both modes (Kimi: white glyph on transparent).

Files without an entry render as-is. When the dataset ships a redrawn icon,
check whether the old traits still apply — Cursor, for example, moved from a
monochrome glyph to a colored `cursor-color.svg` and lost its `mono` flag.

## Testing

- `lib/agent-icons.test.ts` — vendored map, local candidates, trait table,
  precomputed edge colors.
- `hooks/use-agent-icons.test.ts` and `hooks/use-agent-edge-color.test.tsx`
  — synchronous resolution, neutral fallbacks.
- `pages/agents/agent-graph.test.tsx` mocks the hook so layout tests never
  touch the network.
