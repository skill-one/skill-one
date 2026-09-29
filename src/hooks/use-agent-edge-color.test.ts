import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { AGENT_EDGE_COLORS } from "../data/agent-icons.generated";
import { useAgentEdgeColor } from "./use-agent-edge-color";

describe("useAgentEdgeColor", () => {
  it("stays neutral for monochrome glyphs", () => {
    const { result } = renderHook(() => useAgentEdgeColor("cline"));
    expect(result.current).toBeUndefined();
  });

  it("stays neutral when no icon resolves", () => {
    const { result } = renderHook(() => useAgentEdgeColor("unknown"));
    expect(result.current).toBeUndefined();
  });

  it("returns the icon's precomputed color synchronously", () => {
    const { result } = renderHook(() => useAgentEdgeColor("codex"));
    expect(result.current).toBe(AGENT_EDGE_COLORS["icons/codex-color.svg"]);
    expect(result.current).toMatch(/^#[0-9a-f]{6}$/);
  });
});
