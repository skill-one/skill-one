import { describe, expect, it } from "vitest";

import {
  AGENT_ICON_BY_NAME,
  getAgentIconUrl,
  isMonochromeAgentIcon,
  MONOCHROME_ICON_FILES,
} from "./agent-icons";

describe("agent-icons", () => {
  it("maps known agents to their icon assets", () => {
    expect(getAgentIconUrl("claude-code")).toBe("/agent-icons/claudecode-color.svg");
    expect(getAgentIconUrl("cursor")).toBe("/agent-icons/cursor.svg");
  });

  it("returns undefined for unknown agents", () => {
    expect(getAgentIconUrl("not-an-agent")).toBeUndefined();
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

  it("classifies every registered agent consistently with its icon table", () => {
    for (const [name, url] of Object.entries(AGENT_ICON_BY_NAME)) {
      expect(isMonochromeAgentIcon(name)).toBe(MONOCHROME_ICON_FILES.has(url));
    }
  });
});
