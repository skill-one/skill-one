import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useAgentEdgeColor } from "./use-agent-edge-color";
import { useAgentIcon } from "./use-agent-icons";

vi.mock("./use-agent-icons", () => ({
  useAgentIcon: vi.fn(),
}));

const getColorAsync = vi.hoisted(() => vi.fn());
vi.mock("fast-average-color", () => ({
  FastAverageColor: class {
    getColorAsync = getColorAsync;
  },
}));

const useAgentIconMock = vi.mocked(useAgentIcon);

function mockIcon(candidates: string[], mono = false) {
  useAgentIconMock.mockReturnValue({
    candidates,
    mono,
    ground: undefined,
  });
}

beforeEach(() => {
  useAgentIconMock.mockReset();
  getColorAsync.mockReset();
});

describe("useAgentEdgeColor", () => {
  it("stays neutral for monochrome glyphs without analyzing", () => {
    mockIcon(["https://cdn.example/mono.svg"], true);
    const { result } = renderHook(() => useAgentEdgeColor("cline"));
    expect(result.current).toBeUndefined();
    expect(getColorAsync).not.toHaveBeenCalled();
  });

  it("stays neutral when no icon resolves", () => {
    mockIcon([]);
    const { result } = renderHook(() => useAgentEdgeColor("unknown"));
    expect(result.current).toBeUndefined();
    expect(getColorAsync).not.toHaveBeenCalled();
  });

  it("returns the icon's average color once resolved", async () => {
    mockIcon(["https://cdn.example/codex-color.svg"]);
    getColorAsync.mockResolvedValue({ hex: "#3941ff" });
    const { result } = renderHook(() => useAgentEdgeColor("codex"));
    await waitFor(() => expect(result.current).toBe("#3941ff"));
    expect(getColorAsync).toHaveBeenCalledWith(
      "https://cdn.example/codex-color.svg",
      expect.objectContaining({ crossOrigin: "anonymous" }),
    );
  });

  it("falls back to neutral when the analysis fails", async () => {
    mockIcon(["https://cdn.example/offline.svg"]);
    getColorAsync.mockRejectedValue(new Error("CORS"));
    const { result } = renderHook(() => useAgentEdgeColor("offline"));
    await waitFor(() =>
      expect(getColorAsync).toHaveBeenCalledTimes(1),
    );
    expect(result.current).toBeUndefined();
  });
});
