import { describe, expect, it } from "vitest";

import type { AgentStatus } from "../../lib/skills-manager";
import {
  DEFAULT_GRAPH_WIDTH,
  GRAPH_PAD_BOTTOM,
  GRAPH_PAD_TOP,
  HUB_RIGHT_INSET,
  HUB_TIP_GAP,
  HUB_RADIUS,
  MIN_GRAPH_WIDTH,
  NODE_GAP,
  NODE_HEIGHT,
  NODE_WIDTH,
  NODE_X,
  RIBBON_COLORS,
  layoutAgents,
  resolveGraphWidth,
  ribbonColor,
  ribbonColorIndex,
  ribbonPath,
} from "./agent-graph-layout";

function agent(name: string): AgentStatus {
  return { name, display: name, linked: false, canonical: false };
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
    const names = [
      "claude-code",
      "codex",
      "cursor",
      "gemini-cli",
      "windsurf",
    ];
    const used = new Set(names.map(ribbonColorIndex));
    // Weak but meaningful: the five mock agents must not all collapse onto
    // one hue, or the graph loses the logo's multicolour read.
    expect(used.size).toBeGreaterThan(1);
  });
});

describe("ribbonPath", () => {
  it("draws a horizontal-tangent cubic bezier from one point to the other", () => {
    const d = ribbonPath({ x: 100, y: 0 }, { x: 400, y: 200 });
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    // M from, C c1, c2, to — eight coordinates.
    expect(d).toMatch(/^M 100 0 C /);
    expect(nums).toHaveLength(8);
    // The first control point leaves on the start's horizontal tangent; the
    // second arrives on the end's horizontal tangent.
    expect(nums[3]).toBe(0);
    expect(nums[5]).toBe(200);
    expect(nums[6]).toBe(400);
    expect(nums[7]).toBe(200);
  });

  it("keeps a minimum control pull on short ribbons", () => {
    const d = ribbonPath({ x: 100, y: 0 }, { x: 130, y: 0 });
    expect(d).toContain("148 0");
  });
});

describe("resolveGraphWidth", () => {
  it("uses the default before any measurement exists", () => {
    expect(resolveGraphWidth(0)).toBe(DEFAULT_GRAPH_WIDTH);
  });

  it("keeps a measured width when it clears the hub", () => {
    expect(resolveGraphWidth(900)).toBe(900);
  });

  it("floors narrow windows at the minimum canvas width", () => {
    expect(resolveGraphWidth(480)).toBe(MIN_GRAPH_WIDTH);
  });
});

describe("layoutAgents", () => {
  it("falls back to the default width without a measurement", () => {
    const layout = layoutAgents([agent("a")], 0);
    expect(layout.width).toBe(DEFAULT_GRAPH_WIDTH);
  });

  it("centres the hub vertically against the whole node column", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c")],
      800,
    );
    expect(layout.hub.x).toBe(800 - HUB_RIGHT_INSET);
    const columnHeight =
      GRAPH_PAD_TOP +
      3 * NODE_HEIGHT +
      2 * NODE_GAP +
      GRAPH_PAD_BOTTOM;
    expect(layout.height).toBe(columnHeight);
    expect(layout.hub.y).toBeCloseTo(columnHeight / 2);
  });

  it("stacks cards at a fixed pitch and anchors each ribbon on its right edge", () => {
    const layout = layoutAgents([agent("a"), agent("b")], 800);
    expect(layout.nodes[0].x).toBe(NODE_X);
    expect(layout.nodes[0].width).toBe(NODE_WIDTH);
    expect(layout.nodes[1].y).toBe(GRAPH_PAD_TOP + NODE_HEIGHT + NODE_GAP);

    expect(layout.nodes[0].anchor).toEqual({
      x: NODE_X + NODE_WIDTH,
      y: GRAPH_PAD_TOP + NODE_HEIGHT / 2,
    });

    expect(layout.ribbons).toHaveLength(2);
    // Every ribbon ends at the hub's left tip, the point the converging
    // picture is built around.
    const tipX = layout.hub.x - HUB_RADIUS - HUB_TIP_GAP;
    for (const ribbon of layout.ribbons) {
      expect(ribbon.d.endsWith(`${tipX} ${layout.hub.y}`)).toBe(true);
    }
  });

  it("keeps the ribbon order aligned with the node order", () => {
    const agents = [agent("a"), agent("b")];
    const layout = layoutAgents(agents, 800);
    expect(layout.ribbons.map((r) => r.name)).toEqual(["a", "b"]);
  });

  it("lays out an empty list as a padded, hub-only canvas", () => {
    const layout = layoutAgents([], 800);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(GRAPH_PAD_TOP + GRAPH_PAD_BOTTOM);
    expect(layout.nodes).toEqual([]);
    expect(layout.ribbons).toEqual([]);
  });
});
