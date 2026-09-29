import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useAgentIcon } from "./use-agent-icons";

describe("useAgentIcon", () => {
  it("resolves a known agent to its local candidate", () => {
    const { result } = renderHook(() => useAgentIcon("codex"));
    expect(result.current.candidates).toHaveLength(1);
    expect(result.current.candidates[0].endsWith("/agents/icons/codex-color.svg")).toBe(
      true,
    );
    expect(result.current.mono).toBe(false);
  });

  it("flags monochrome glyphs", () => {
    const { result } = renderHook(() => useAgentIcon("cline"));
    expect(result.current.mono).toBe(true);
  });

  it("resolves unknown agents to no candidates", () => {
    const { result } = renderHook(() => useAgentIcon("unknown"));
    expect(result.current.candidates).toEqual([]);
  });
});
