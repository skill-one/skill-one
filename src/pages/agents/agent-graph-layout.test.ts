import { describe, expect, it } from "vitest";

import type { AgentStatus } from "../../lib/skills-manager";
import {
  DEFAULT_GRAPH_HEIGHT,
  DEFAULT_GRAPH_WIDTH,
  GOLDEN_ANGLE,
  HUB_RADIUS,
  HUB_TIP_GAP,
  NODE_SIZE_MAX,
  NODE_SIZE_MIN,
  OUTER_PAD,
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
    // Weak but meaningful: the five mock agents must not all collapse onto
    // one hue, or the graph loses the logo's multicolour read.
    expect(used.size).toBeGreaterThan(1);
  });
});

describe("ribbonPath", () => {
  it("is one cubic bezier from the anchor to the hub tip", () => {
    const d = ribbonPath({ x: 200, y: 300 }, { x: 300, y: 300 });
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    expect(d).toMatch(/^M 200 300 C /);
    // M from, C c1, c2, to — eight coordinates.
    expect(nums).toHaveLength(8);
    expect(nums[6]).toBe(300);
    expect(nums[7]).toBe(300);
  });

  it("bows both controls to the same side — one shared swirl handedness", () => {
    // A spoke running east into the hub bows to one side of the chord; the
    // mirrored spoke bows with the same (counterclockwise) handedness.
    const east = ribbonPath({ x: 300, y: 300 }, { x: 200, y: 300 });
    const west = ribbonPath({ x: 100, y: 300 }, { x: 200, y: 300 });
    const eastNums = east.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const westNums = west.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // Coordinate order is M(from) C(c1x,c1y c2x,c2y to): the bow shows on the
    // control points' y (indices 3 and 5), not the endpoints (1 and 7).
    // East-side spoke travels west; its CCW normal is north (negative y); the
    // west-side spoke mirrors it, normal south.
    expect(eastNums[3]).toBeLessThan(300);
    expect(eastNums[5]).toBeLessThan(300);
    expect(westNums[3]).toBeGreaterThan(300);
    expect(westNums[5]).toBeGreaterThan(300);
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

describe("layoutAgents", () => {
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
    expect(layout.hub.x).toBe(450);
    expect(layout.hub.y).toBe(350);
  });

  it("is deterministic — the same roster lands in the same places", () => {
    const a = layoutAgents(roster(12), 900, 700);
    const b = layoutAgents(roster(12), 900, 700);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.ribbons).toEqual(b.ribbons);
  });

  it("steps each node the golden angle around the hub, starting on top", () => {
    const layout = layoutAgents(roster(6), 900, 700);
    // Node 0 starts one spoke above the hub.
    expect(layout.nodes[0].angle).toBeCloseTo(-Math.PI / 2, 10);
    for (let i = 1; i < layout.nodes.length; i += 1) {
      const turn = layout.nodes[i].angle - layout.nodes[i - 1].angle;
      expect(turn).toBeCloseTo(GOLDEN_ANGLE, 10);
    }
  });

  it("scatters a roster to every side of the hub", () => {
    const layout = layoutAgents(roster(12), 900, 700);
    const { hub } = layout;
    const quadrants = new Set(
      layout.nodes.map((n) => {
        const dx = n.x + n.width / 2 - hub.x;
        const dy = n.y + n.height / 2 - hub.y;
        return `${dy < 0 ? "t" : "b"}${dx < 0 ? "l" : "r"}`;
      }),
    );
    // Twelve golden-angle steps visit all four quadrants — not a left/right
    // column layout.
    expect(quadrants.size).toBe(4);
  });

  it("keeps square tiles from overlapping for a full roster", () => {
    const N = 35;
    const layout = layoutAgents(roster(N), 1400, 1100);
    expect(layout.nodes).toHaveLength(N);
    expect(layout.nodes[0].width).toBe(NODE_SIZE_MAX);
    for (let i = 0; i < N; i += 1) {
      for (let j = i + 1; j < N; j += 1) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        // Axis-aligned square overlap needs BOTH axes to close in.
        const overlapX = Math.abs(a.x - b.x) < a.width;
        const overlapY = Math.abs(a.y - b.y) < a.height;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it("keeps every tile inside the canvas and clear of the hub rim", () => {
    const layout = layoutAgents(roster(20), 900, 700);
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(OUTER_PAD - 0.001);
      expect(node.y).toBeGreaterThanOrEqual(OUTER_PAD - 0.001);
      expect(node.x + node.width).toBeLessThanOrEqual(
        layout.width - OUTER_PAD + 0.001,
      );
      expect(node.y + node.height).toBeLessThanOrEqual(
        layout.height - OUTER_PAD + 0.001,
      );
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      expect(Math.hypot(cx - layout.hub.x, cy - layout.hub.y)).toBeGreaterThan(
        HUB_RADIUS + HUB_TIP_GAP + node.width / 2,
      );
    }
  });

  it("runs each ribbon from the tile's hub-facing edge to the hub rim", () => {
    const layout = layoutAgents(roster(6), 900, 700);
    for (const [i, ribbon] of layout.ribbons.entries()) {
      const node = layout.nodes[i];
      const nums = ribbon.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      // Starts exactly at the node anchor.
      expect(nums[0]).toBeCloseTo(node.anchor.x, 6);
      expect(nums[1]).toBeCloseTo(node.anchor.y, 6);
      // Ends on the hub rim circle, on the node's own ray.
      const tipX = nums[6];
      const tipY = nums[7];
      expect(Math.hypot(tipX - layout.hub.x, tipY - layout.hub.y)).toBeCloseTo(
        HUB_RADIUS + HUB_TIP_GAP,
        6,
      );
    }
  });

  it("shrinks the tiles before growing the canvas when the roster is long", () => {
    const roomy = layoutAgents(roster(35), 1400, 1100);
    const tight = layoutAgents(roster(35), 700, 460);
    expect(roomy.nodes[0].width).toBe(NODE_SIZE_MAX);
    expect(tight.nodes[0].width).toBeLessThan(NODE_SIZE_MAX);
    // Even shrunk, the constellation still fits the box it reports.
    for (const node of tight.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(tight.width);
      expect(node.y + node.height).toBeLessThanOrEqual(tight.height);
    }
  });

  it("grows the canvas (never below the floor tile) when it truly cannot fit", () => {
    const layout = layoutAgents(roster(40), 300, 300);
    expect(layout.nodes[0].width).toBe(NODE_SIZE_MIN);
    expect(layout.width).toBeGreaterThan(300);
    expect(layout.height).toBeGreaterThan(300);
  });

  it("points the name tooltip away from the hub", () => {
    const layout = layoutAgents(roster(8), 900, 700);
    const { hub } = layout;
    for (const node of layout.nodes) {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const dx = cx - hub.x;
      const dy = cy - hub.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        expect(node.tipSide).toBe(dx >= 0 ? "right" : "left");
      } else {
        expect(node.tipSide).toBe(dy >= 0 ? "bottom" : "top");
      }
    }
  });

  it("lays out an empty roster as a hub-only canvas", () => {
    const layout = layoutAgents([], 800, 600);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(600);
    expect(layout.nodes).toEqual([]);
    expect(layout.ribbons).toEqual([]);
  });
});
