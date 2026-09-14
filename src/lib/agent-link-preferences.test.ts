import { afterEach, describe, expect, it } from "vitest";

import {
  excludeAgent,
  getExcludedAgents,
  includeAgent,
} from "./agent-link-preferences";

afterEach(() => {
  window.localStorage.clear();
});

describe("agent link preferences", () => {
  it("starts empty", () => {
    expect(getExcludedAgents()).toEqual([]);
  });

  it("round-trips exclusions", () => {
    excludeAgent("cursor");
    excludeAgent("gemini-cli");
    expect(getExcludedAgents()).toEqual(["cursor", "gemini-cli"]);
  });

  it("ignores duplicate exclusions", () => {
    excludeAgent("cursor");
    excludeAgent("cursor");
    expect(getExcludedAgents()).toEqual(["cursor"]);
  });

  it("includeAgent clears one exclusion", () => {
    excludeAgent("cursor");
    excludeAgent("gemini-cli");
    includeAgent("cursor");
    expect(getExcludedAgents()).toEqual(["gemini-cli"]);
  });

  it("falls back to the in-memory copy on corrupt storage", () => {
    // Seed the fallback first, then corrupt the persisted copy.
    excludeAgent("session-agent");
    window.localStorage.setItem("skill-one.excludedAgents", "{not json");
    expect(getExcludedAgents()).toEqual(["session-agent"]);
  });

  it("falls back to the in-memory copy on a non-array payload", () => {
    excludeAgent("session-agent");
    window.localStorage.setItem(
      "skill-one.excludedAgents",
      JSON.stringify({ a: 1 }),
    );
    expect(getExcludedAgents()).toEqual(["session-agent"]);
  });

  it("drops non-string entries", () => {
    window.localStorage.setItem(
      "skill-one.excludedAgents",
      JSON.stringify(["ok", 3, null]),
    );
    expect(getExcludedAgents()).toEqual(["ok"]);
  });
});
