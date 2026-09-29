import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  agentIconCandidates,
  agentIconSourceCandidates,
  agentIconTraits,
  loadAgentIcons,
  readStoredAgentIcons,
} from "./agent-icons";

// A manifest shaped like the real `agents.jsonl`: one JSON record per line,
// including a null-icon record (the catch-all agent) and lines a torn
// download could produce.
const MANIFEST = [
  JSON.stringify({ name: "codex", icon: "icons/codex-color.svg" }),
  JSON.stringify({ name: "trae-cn", icon: "icons/trae-color.svg" }),
  JSON.stringify({ name: "universal", icon: null }),
  JSON.stringify({ name: "eve", icon: "https://vercel.com/eve.png" }),
  "not json",
  "",
].join("\n");

function serveManifest(text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => text })),
  );
}

function serveNetworkFailure() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("network down");
    }),
  );
}

const CACHE_KEY = "skill-one.agentIcons";

describe("agent-icons", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the dataset manifest and persists the parsed copy", async () => {
    serveManifest(MANIFEST);

    const icons = await loadAgentIcons();

    expect(icons).toEqual({
      codex: "icons/codex-color.svg",
      "trae-cn": "icons/trae-color.svg",
      eve: "https://vercel.com/eve.png",
    });
    // The copy in localStorage is what offline launches fall back to.
    expect(readStoredAgentIcons()).toEqual(icons);
  });

  it("skips records without a usable name and icon pair", async () => {
    serveManifest(MANIFEST);

    const icons = await loadAgentIcons();

    // The null-icon catch-all and the malformed line never make the map.
    expect(icons.universal).toBeUndefined();
    expect(Object.keys(icons)).toHaveLength(3);
  });

  it("falls back to the last stored copy when the dataset is unreachable", async () => {
    serveManifest(MANIFEST);
    await loadAgentIcons();

    serveNetworkFailure();
    const icons = await loadAgentIcons();

    expect(icons.codex).toBe("icons/codex-color.svg");
  });

  it("rejects when there is no network and nothing stored", async () => {
    serveNetworkFailure();

    await expect(loadAgentIcons()).rejects.toThrow(/no cached copy/);
  });

  it("ignores a stored copy whose version no longer matches", async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ v: 0, icons: { codex: "icons/stale.svg" } }),
    );

    serveNetworkFailure();

    await expect(loadAgentIcons()).rejects.toThrow(/no cached copy/);
  });

  it("resolves repo-relative icons through the CDN fallback chain", () => {
    expect(agentIconCandidates("icons/codex-color.svg")).toEqual([
      "https://raw.githubusercontent.com/skill-one/agents-info/HEAD/icons/codex-color.svg",
      "https://cdn.jsdmirror.com/gh/skill-one/agents-info/icons/codex-color.svg",
    ]);
  });

  it("uses an off-repo https icon as its own single candidate", () => {
    expect(agentIconCandidates("https://vercel.com/eve.png")).toEqual([
      "https://vercel.com/eve.png",
    ]);
  });

  it("reads the manifest itself from the same chain", () => {
    expect(agentIconSourceCandidates()).toEqual([
      "https://raw.githubusercontent.com/skill-one/agents-info/HEAD/agents.jsonl",
      "https://cdn.jsdmirror.com/gh/skill-one/agents-info/agents.jsonl",
    ]);
  });

  it("flags monochrome `currentColor` icons as needing dark-mode inversion", () => {
    expect(agentIconTraits("icons/cline.svg").mono).toBe(true);
    expect(agentIconTraits("icons/githubcopilot.svg").mono).toBe(true);
    expect(agentIconTraits("icons/windsurf.svg").mono).toBe(true);
  });

  it("keeps colored brand icons un-inverted", () => {
    // Colored, including the dataset's colored redraw of the once-mono Cursor.
    expect(agentIconTraits("icons/codex-color.svg").mono).toBe(false);
    expect(agentIconTraits("icons/cursor-color.svg").mono).toBe(false);
  });

  it("grounds only the surface-bound artwork, verified on both backgrounds", () => {
    expect(agentIconTraits("icons/kimi-color.svg").ground).toBe("dark"); // white K on transparent
    expect(agentIconTraits("icons/codex-color.svg").ground).toBeUndefined(); // covered layer, reads fine
    expect(agentIconTraits("icons/kiro-color.svg").ground).toBeUndefined(); // full-bleed purple tile
    expect(agentIconTraits("icons/warp.png").ground).toBeUndefined(); // raster avatar
  });

  it("answers plain traits for files outside the table", () => {
    const traits = agentIconTraits("icons/never-seen.svg");
    expect(traits.mono).toBe(false);
    expect(traits.ground).toBeUndefined();
  });
});
