import { fileCandidates, fetchFirstText } from "./cdn-config";
import { storage } from "./storage";

/**
 * Where agent brand icons come from: the `agents-info` dataset repo, fetched
 * at runtime instead of vendored into `public/`. The dataset keeps the whole
 * picture — every agent's `name → icon` mapping in `agents.jsonl`, and the
 * icon files themselves under `icons/` — so the app never repeats it, and a
 * new agent (or a redrawn logo) shows up without an app update.
 *
 * The manifest rides the same download source and CDN fallback chain as the
 * registry index (see `lib/cdn-config`): direct GitHub first, the default
 * jsDelivr mirror as fallback, and a user-configured CDN ahead of both when
 * one is set. Each icon file resolves through the same chain, so the images
 * load even where `raw.githubusercontent.com` does not.
 */

const DATASET_REPO = "skill-one/agents-info";
const DATASET_PATH = "agents.jsonl";

/** localStorage key for the parsed manifest copy (offline fallback). */
const CACHE_KEY = "skill-one.agentIcons";
/** Bump when the stored shape changes in a way old copies can't serve. */
const CACHE_VERSION = 1;

/** Agent name → icon spec: a repo-relative dataset path or an https URL. */
export type AgentIconMap = Record<string, string>;

interface StoredCache {
  v: number;
  icons: AgentIconMap;
}

/**
 * Parse the JSONL manifest. One record per line; a torn or foreign line is
 * skipped rather than failing the whole load. Records with a null icon (the
 * built-in catch-all agent) simply don't map — the UI shows its Bot fallback.
 */
function parseAgentJsonl(text: string): AgentIconMap {
  const icons: AgentIconMap = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as { name?: unknown; icon?: unknown };
      if (
        typeof record.name === "string" &&
        record.name.length > 0 &&
        typeof record.icon === "string" &&
        record.icon.length > 0
      ) {
        icons[record.name] = record.icon;
      }
    } catch {
      // Not a JSON object: skip the line, keep the rest.
    }
  }
  return icons;
}

function readStoredIcons(): AgentIconMap | null {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCache;
    if (
      parsed?.v !== CACHE_VERSION ||
      typeof parsed.icons !== "object" ||
      parsed.icons === null
    ) {
      return null;
    }
    return parsed.icons;
  } catch {
    return null;
  }
}

function writeStoredIcons(icons: AgentIconMap): void {
  const cache: StoredCache = { v: CACHE_VERSION, icons };
  storage.setItem(CACHE_KEY, JSON.stringify(cache));
}

/** Every URL the manifest itself may be read from, most authoritative first. */
export function agentIconSourceCandidates(): string[] {
  return fileCandidates({ repo: DATASET_REPO, path: DATASET_PATH });
}

/**
 * Load the agent→icon map. Fetches the dataset manifest through the CDN
 * fallback chain, persists the parsed copy to localStorage, and — when every
 * source is unreachable — falls back to the last stored copy so offline
 * launches still get icons. Rejects only when there is nothing to draw from
 * at all (no network on first ever run); react-query then surfaces the Bot
 * fallback everywhere.
 */
export async function loadAgentIcons(): Promise<AgentIconMap> {
  try {
    const { text } = await fetchFirstText(agentIconSourceCandidates());
    const icons = parseAgentJsonl(text);
    if (Object.keys(icons).length > 0) {
      writeStoredIcons(icons);
      return icons;
    }
  } catch {
    // Unreachable or unusable body: the stored copy below gets its turn.
  }
  const stored = readStoredIcons();
  if (stored) return stored;
  throw new Error(
    "No agent icon map available: dataset unreachable and no cached copy",
  );
}

/**
 * The last persisted map, read synchronously — handed to the hook as
 * `initialData`, so cached icons render on first paint while the manifest
 * refreshes in the background.
 */
export function readStoredAgentIcons(): AgentIconMap | null {
  return readStoredIcons();
}

/** Every URL an icon file may be read from, most authoritative first. */
export function agentIconCandidates(icon: string): string[] {
  // Off-repo artwork (a product's own hosted logo) has no mirror to fall
  // back to — its one URL is the whole chain.
  if (/^https:\/\//i.test(icon)) return [icon];
  return fileCandidates({ repo: DATASET_REPO, path: icon });
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
