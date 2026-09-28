import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AGENT_ICON_BY_NAME,
  agentIconGround,
  getAgentIconUrl,
  isMonochromeAgentIcon,
} from "./agent-icons";

// A trait key that no agent maps to would silently do nothing, so every
// traits entry must reference an icon some agent actually uses. The traits
// table itself is private; this guards its keys through the public surface.
const EXPECTED_TRAITED_FILES = [
  "/agent-icons/cline.svg",
  "/agent-icons/commandcode.svg",
  "/agent-icons/cursor.svg",
  "/agent-icons/githubcopilot.svg",
  "/agent-icons/goose.svg",
  "/agent-icons/grok.svg",
  "/agent-icons/hermesagent.svg",
  "/agent-icons/inference.svg",
  "/agent-icons/kimi-color.svg",
  "/agent-icons/kilocode.svg",
  "/agent-icons/lmstudio.svg",
  "/agent-icons/opencode.svg",
  "/agent-icons/pi.svg",
  "/agent-icons/roocode.svg",
  "/agent-icons/windsurf.svg",
];

describe("agent-icons", () => {
  it("maps known agents to their icon assets", () => {
    expect(getAgentIconUrl("claude-code")).toBe("/agent-icons/claudecode-color.svg");
    expect(getAgentIconUrl("cursor")).toBe("/agent-icons/cursor.svg");
  });

  it("returns undefined for unknown agents", () => {
    expect(getAgentIconUrl("not-an-agent")).toBeUndefined();
  });

  it("resolves variant agents to their parent brand's icon", () => {
    expect(getAgentIconUrl("trae-cn")).toBe(getAgentIconUrl("trae"));
    expect(getAgentIconUrl("workbuddy-ai")).toBe(getAgentIconUrl("workbuddy"));
    expect(getAgentIconUrl("lingma")).toBe(getAgentIconUrl("qwen-code"));
  });

  it("flags monochrome `currentColor` icons as needing dark-mode inversion", () => {
    expect(isMonochromeAgentIcon("cursor")).toBe(true);
    expect(isMonochromeAgentIcon("cline")).toBe(true);
    expect(isMonochromeAgentIcon("github-copilot")).toBe(true);
    expect(isMonochromeAgentIcon("windsurf")).toBe(true);
  });

  it("keeps colored brand icons un-inverted", () => {
    expect(isMonochromeAgentIcon("claude-code")).toBe(false);
    expect(isMonochromeAgentIcon("codex")).toBe(false);
    expect(isMonochromeAgentIcon("qwen-code")).toBe(false);
  });

  it("never treats unknown agents as monochrome", () => {
    expect(isMonochromeAgentIcon("not-an-agent")).toBe(false);
  });

  it("classifies every registered agent's traits through the public surface", () => {
    for (const [name, url] of Object.entries(AGENT_ICON_BY_NAME)) {
      const mono = isMonochromeAgentIcon(name);
      const ground = agentIconGround(name);
      // A file is either a monochrome glyph, a grounded artwork, or plain —
      // never both, and every trait flag must trace back to the agent's file.
      if (mono) expect(EXPECTED_TRAITED_FILES).toContain(url);
      if (ground) {
        expect(EXPECTED_TRAITED_FILES).toContain(url);
        expect(mono).toBe(false);
      }
    }
    // Every traited file is reachable from at least one agent (no dead keys).
    const mapped = new Set(Object.values(AGENT_ICON_BY_NAME));
    for (const url of EXPECTED_TRAITED_FILES) {
      expect(mapped.has(url), `traited file no agent maps to: ${url}`).toBe(true);
    }
  });

  it("points every registered agent at an icon file that exists on disk", () => {
    for (const url of new Set(Object.values(AGENT_ICON_BY_NAME))) {
      const file = resolve(process.cwd(), "public", url.replace(/^\//, ""));
      expect(existsSync(file), `missing icon asset: ${url}`).toBe(true);
    }
  });

  it("grounds only the surface-bound artwork, verified on both backgrounds", () => {
    // Surface-bound artwork must always get a ground; self-grounded or
    // avatar-based icons must never get one.
    expect(agentIconGround("kimi-code-cli")).toBe("dark"); // white K on transparent
    expect(agentIconGround("codex")).toBeUndefined(); // covered layer, reads fine
    expect(agentIconGround("openhands")).toBeUndefined(); // yellow hands read fine
    expect(agentIconGround("kiro-cli")).toBeUndefined(); // full-bleed purple tile
    expect(agentIconGround("claude-code")).toBeUndefined();
    expect(agentIconGround("warp")).toBeUndefined(); // raster avatar
    expect(agentIconGround("not-an-agent")).toBeUndefined();
  });
});
