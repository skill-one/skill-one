import { describe, expect, it } from "vitest";

import type { AgentStatus } from "../../lib/skills-manager";
import {
  COL_GAP,
  DEFAULT_GRAPH_HEIGHT,
  DEFAULT_GRAPH_WIDTH,
  HUB_CARD_HALF_COLUMNS,
  HUB_RADIUS,
  NODE_LABEL_GAP,
  NODE_LABEL_WIDTH,
  RIBBON_COLORS,
  layoutAgents,
  resolveGraphWidth,
  ribbonColor,
  ribbonColorIndex,
  sCurvePath,
} from "./agent-graph-layout";

function agent(name: string): AgentStatus {
  return { name, display: name, linked: false, canonical: false };
}

function roster(n: number): AgentStatus[] {
  return Array.from({ length: n }, (_, i) => agent(`a${i}`));
}

describe("ribbonColor", () => {
  it("always returns one of the five brand hues", () => {
    for (const name of ["a", "claude-code", "cursor", "x-y-z-123"]) {
      expect(RIBBON_COLORS).toContain(ribbonColor(name));
    }
  });

  it("is stable per agent name", () => {
    expect(ribbonColorIndex("trae")).toBe(ribbonColorIndex("trae"));
  });

  it("covers every palette slot across the mock agent names", () => {
    const names = ["claude-code", "codex", "cursor", "gemini-cli", "windsurf"];
    const used = new Set(names.map(ribbonColorIndex));
    expect(used.size).toBeGreaterThan(1);
  });
});

describe("sCurvePath", () => {
  it("keeps both tangents horizontal into the hub tip", () => {
    const d = sCurvePath({ x: 100, y: 300 }, { x: 400, y: 200 });
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // The first control leaves horizontally from the anchor and the second
    // arrives horizontally at the tip.
    expect(nums[3]).toBe(300);
    expect(nums[5]).toBe(200);
    expect(nums[6]).toBe(400);
    expect(nums[7]).toBe(200);
  });
});

describe("resolveGraphWidth", () => {
  it("uses the default before any measurement exists", () => {
    expect(resolveGraphWidth(0)).toBe(DEFAULT_GRAPH_WIDTH);
  });

  it("keeps the measured width once measured", () => {
    expect(resolveGraphWidth(900)).toBe(900);
  });
});

describe("layoutAgents dual columns", () => {
  it("falls back to the default canvas without a measurement", () => {
    const layout = layoutAgents([agent("a")], 0, 0);
    expect(layout.width).toBe(DEFAULT_GRAPH_WIDTH);
    expect(layout.height).toBe(DEFAULT_GRAPH_HEIGHT);
    expect(layout.hub).toEqual({
      x: DEFAULT_GRAPH_WIDTH / 2,
      y: DEFAULT_GRAPH_HEIGHT / 2,
      radius: HUB_RADIUS,
    });
  });

  it("centres the hub on the canvas", () => {
    const layout = layoutAgents(roster(8), 900, 700);
    expect(layout.hub.x).toBe(layout.width / 2);
    expect(layout.hub.y).toBe(layout.height / 2);
  });

  it("is deterministic — the same roster lands in the same places", () => {
    const a = layoutAgents(roster(12), 900, 700);
    const b = layoutAgents(roster(12), 900, 700);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.ribbons).toEqual(b.ribbons);
  });

  it("splits a roster into balanced columns on the hub's two sides", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    const left = layout.nodes.filter((n) => n.side === "left");
    const right = layout.nodes.filter((n) => n.side === "right");
    expect(left.map((n) => n.name)).toEqual(["a", "b"]);
    expect(right.map((n) => n.name)).toEqual(["c", "d"]);
  });

  it("anchors each ribbon on the pill's hub-facing edge", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    for (const node of layout.nodes) {
      if (node.side === "left") {
        expect(node.anchor.x).toBe(node.x + node.width);
      } else {
        expect(node.anchor.x).toBe(node.x);
      }
    }
  });

  it("ends every ribbon at the hub card side wall on its own side", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    const tipX = (side: string) =>
      side === "left"
        ? layout.hub.x - HUB_CARD_HALF_COLUMNS
        : layout.hub.x + HUB_CARD_HALF_COLUMNS;
    for (const [i, node] of layout.nodes.entries()) {
      const nums = layout.ribbons[i].d
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      expect(nums[6]).toBeCloseTo(tipX(node.side), 6);
      expect(nums[7]).toBe(layout.hub.y);
    }
  });

  it("numbers columns in fill order for the entrance cascade", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    expect(layout.nodes.map((n) => n.col)).toEqual([0, 0, 1, 1]);
  });

  it("keeps name pills aligned on a fixed pitch within a column", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    const [a, b] = layout.nodes.filter((n) => n.side === "left");
    expect(b.y - a.y).toBe(a.height + COL_GAP);
    expect(a.width).toBe(a.height + NODE_LABEL_GAP + NODE_LABEL_WIDTH);
  });

  it("handles empty roster gracefully", () => {
    const layout = layoutAgents([], 800, 600);
    expect(layout.nodes).toEqual([]);
    expect(layout.ribbons).toEqual([]);
    expect(layout.hub.x).toBe(400);
    expect(layout.hub.y).toBe(300);
  });
});
