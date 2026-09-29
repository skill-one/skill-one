# Agent Icons

Where agent brand icons come from, and how they reach the screen.

## Source: the `agents-info` dataset

Agent icons are **not vendored into this app**. Everything lives in the
[`skill-one/agents-info`](https://github.com/skill-one/agents-info) dataset
repo:

- `agents.jsonl` — one JSON record per agent; the `name` field is the key the
  app resolves icons with, the `icon` field points at the artwork.
- `icons/` — the icon files themselves (SVG and PNG). Variant agents
  (region-locked or CLI editions) share their parent brand's file.

Because the dataset owns the whole `name → icon` mapping, a new agent or a
redrawn logo shows up in the app without an app update.

## Loading pipeline

1. `lib/agent-icons.ts` fetches `agents.jsonl` through the shared CDN
   fallback chain (`lib/cdn-config.ts`): a user-configured CDN first, then
   direct `raw.githubusercontent.com`, then the default jsDelivr mirror.
2. The manifest is parsed line by line (torn or foreign lines are skipped)
   into a `name → icon` map and persisted to `localStorage`
   (`skill-one.agentIcons`, versioned).
3. `hooks/use-agent-icons.ts` exposes the map through one shared react-query
   query (`["agent-icons"]`). The stored copy seeds the query as
   `initialData`, so a warm start paints real icons on first paint; the
   manifest refreshes in the background after the 30-minute stale time.
   A failed refresh (offline) leaves the seeded data on screen.
4. Each icon file resolves to its own candidate chain:
   - repo-relative (`icons/codex-color.svg`) → the same CDN fallback chain;
   - absolute https URL → the URL itself, as its own single candidate.

`AgentIcon` (`components/agent-icon.tsx`) walks the candidate chain one step
per failed load and falls back to a generic Bot glyph when nothing resolves —
unknown agent, null icon, or dataset unreachable on first ever run.

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

## Caching and offline behavior

| Layer | What it covers | Lifetime |
|-------|----------------|----------|
| react-query cache | The parsed manifest, shared by all mounted icons | Session |
| `localStorage` | The parsed manifest, seeded back on next launch | Until replaced by a successful refresh |
| WebView HTTP cache | Icon files themselves | Per browser cache policy |

With no network and no stored copy (first ever run, offline), every agent
falls back to the Bot glyph.

## Testing

- `lib/agent-icons.test.ts` — manifest parsing, persistence and offline
  fallback, candidate chains, trait table.
- `pages/installed/agent-avatar-group.test.tsx` and
  `pages/agents/agent-graph.test.tsx` mock the hook so layout tests never
  touch the network.
