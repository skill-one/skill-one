import {
  AGENT_EDGE_COLORS,
  AGENT_ICON_MAP,
} from "../data/agent-icons.generated";

/**
 * Where agent brand icons come from: the `agents-info` dataset repo, vendored
 * into this app instead of fetched at runtime. `scripts/sync-agents-info.mjs`
 * copies the whole picture — every agent's `name → icon` mapping from
 * `agents.jsonl`, and the icon files themselves under `public/agents/icons/`
 * — into a generated table, so launches work fully offline and a missing
 * network never flashes a wrong icon.
 *
 * A new agent (or a redrawn logo) still needs an app update: re-run
 * `pnpm sync:agents` and commit the refreshed `public/agents/` copy plus
 * the regenerated table.
 */

/** Agent name → icon spec: a path under `public/agents/`, or an https URL. */
export type AgentIconMap = Record<string, string>;

/** The vendored agent → icon map. */
export function agentIconMap(): AgentIconMap {
  return AGENT_ICON_MAP;
}

/**
 * Every URL an icon file may be read from. Vendored icons live under
 * `public/agents/` (served at the app root, bundled into `dist`); off-repo
 * artwork (a product's own hosted logo) has no local copy — its one URL is
 * the whole chain.
 */
export function agentIconCandidates(icon: string): string[] {
  // Off-repo artwork has no local copy to fall back to.
  if (/^https:\/\//i.test(icon)) return [icon];
  return [`${import.meta.env.BASE_URL}agents/${icon}`];
}

// How AgentIcon must treat a given icon file's artwork. Keyed by the icon
// path as recorded in the dataset (`icons/...`), not by agent name, so the
// traits survive the dataset re-pointing a variant at another brand's file —
// they describe the artwork, and travel with it. Files without an entry
// render as-is. Two traits, each verified by actually rendering the asset on
// both backgrounds (fill heuristics lie — white/black paths may be covered
// layers or mere outlines):
//
// - `mono`: drawn as a monochrome `currentColor` glyph. As an `<img>` source
//   it loses the page's CSS context and resolves to black — invisible on the
//   dark surface. AgentIcon inverts it in dark mode (black → white).
// - `ground`: surface-bound artwork that must be painted on a fixed
//   contrasting ground in both modes. Currently only Kimi: a white "K" on a
//   transparent background that vanishes on light backgrounds, leaving just
//   its blue accent.
//
// Cursor is deliberately absent: the dataset ships `cursor-color.svg`, a
// colored redraw of the once-monochrome glyph.
const FILE_TRAITS: Readonly<
  Record<string, { mono?: true; ground?: "dark" | "light" }>
> = {
  "icons/cline.svg": { mono: true },
  "icons/commandcode.svg": { mono: true },
  "icons/githubcopilot.svg": { mono: true },
  "icons/goose.svg": { mono: true },
  "icons/grok.svg": { mono: true },
  "icons/hermesagent.svg": { mono: true },
  "icons/inference.svg": { mono: true },
  "icons/kimi-color.svg": { ground: "dark" },
  "icons/kilocode.svg": { mono: true },
  "icons/lmstudio.svg": { mono: true },
  "icons/opencode.svg": { mono: true },
  "icons/pi.svg": { mono: true },
  "icons/roocode.svg": { mono: true },
  "icons/windsurf.svg": { mono: true },
};

export interface AgentIconTraits {
  /** Monochrome glyph that needs a dark-mode inversion. */
  mono: boolean;
  /** The contrasting ground the artwork must be painted on, if any. */
  ground?: "dark" | "light";
}

/** The rendering traits of one icon file, as recorded by artwork inspection. */
export function agentIconTraits(icon: string): AgentIconTraits {
  const traits = FILE_TRAITS[icon];
  return { mono: traits?.mono === true, ground: traits?.ground };
}

/**
 * The precomputed edge (average) color of one icon file, written by the sync
 * script with the same `sqrt` average `fast-average-color` used to compute
 * at runtime. Monochrome glyphs average to black — useless as an edge color —
 * so they resolve to `undefined` and stay neutral, as do files outside the
 * generated table.
 */
export function agentEdgeColor(icon: string): string | undefined {
  if (agentIconTraits(icon).mono) return undefined;
  return AGENT_EDGE_COLORS[icon];
}
