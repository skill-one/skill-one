import { describe, expect, it } from "vitest";

import {
  AGENT_EDGE_COLORS,
  AGENT_ICON_MAP,
} from "../data/agent-icons.generated";
import {
  agentEdgeColor,
  agentIconCandidates,
  agentIconMap,
  agentIconTraits,
} from "./agent-icons";

describe("agent-icons", () => {
  it("vendors a non-empty agent map with the known brands", () => {
    const icons = agentIconMap();
    expect(Object.keys(icons).length).toBeGreaterThan(0);
    expect(icons.codex).toBe("icons/codex-color.svg");
    expect(icons["trae-cn"]).toBe("icons/trae-color.svg");
    // The null-icon catch-all has no artwork: the UI draws its Bot fallback.
    expect(icons.universal).toBeUndefined();
    expect(icons).toEqual(AGENT_ICON_MAP);
  });

  it("serves vendored icons from the local public copy", () => {
    const candidates = agentIconCandidates("icons/codex-color.svg");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].endsWith("/agents/icons/codex-color.svg")).toBe(true);
  });

  it("uses an off-repo https icon as its own single candidate", () => {
    expect(agentIconCandidates("https://vercel.com/eve.png")).toEqual([
      "https://vercel.com/eve.png",
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

  it("precomputes an edge color for every vendored artwork file", () => {
    const files = new Set(
      Object.values(AGENT_ICON_MAP).filter(
        (icon): icon is string => typeof icon === "string",
      ),
    );
    for (const file of files) {
      expect(AGENT_EDGE_COLORS[file]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("resolves the edge color of a colored icon", () => {
    expect(agentEdgeColor("icons/codex-color.svg")).toBe(
      AGENT_EDGE_COLORS["icons/codex-color.svg"],
    );
  });

  it("stays neutral for monochrome glyphs and unknown files", () => {
    expect(agentEdgeColor("icons/cline.svg")).toBeUndefined();
    expect(agentEdgeColor("icons/never-seen.svg")).toBeUndefined();
  });
});
