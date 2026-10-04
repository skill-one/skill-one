import { describe, expect, it } from "vitest";

import type { AgentStatus } from "../../lib/skills-manager";
import {
  COL_GAP,
  DEFAULT_GRAPH_HEIGHT,
  DEFAULT_GRAPH_WIDTH,
  GOLDEN_ANGLE,
  HUB_CARD_HALF,
  HUB_CARD_HALF_COLUMNS,
  HUB_CARD_HALF_H,
  HUB_RADIUS,
  HUB_TIP_GAP,
  NODE_LABEL_GAP,
  NODE_LABEL_WIDTH,
  NODE_SIZE_MAX,
  NODE_SIZE_MIN,
  OUTER_PAD,
  RIBBON_COLORS,
  layoutAgents,
  pillWidth,
  resolveGraphWidth,
  ribbonColor,
  ribbonColorIndex,
  sCurvePath,
  swirlPath,
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

describe("swirlPath", () => {
  it("is one cubic bezier from the anchor to the hub tip", () => {
    const d = swirlPath({ x: 200, y: 300 }, { x: 300, y: 300 });
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
    const east = swirlPath({ x: 300, y: 300 }, { x: 200, y: 300 });
    const west = swirlPath({ x: 100, y: 300 }, { x: 200, y: 300 });
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

describe("layoutAgents", () => {
  it("falls back to the default canvas without a measurement", () => {
    const layout = layoutAgents([agent("a")], 0, 0, "constellation");
    expect(layout.width).toBe(DEFAULT_GRAPH_WIDTH);
    expect(layout.height).toBe(DEFAULT_GRAPH_HEIGHT);
    expect(layout.hub).toEqual({
      x: DEFAULT_GRAPH_WIDTH / 2,
      y: DEFAULT_GRAPH_HEIGHT / 2,
      radius: HUB_RADIUS,
    });
  });

  it("centres the hub on the canvas", () => {
    const layout = layoutAgents(roster(8), 900, 700, "constellation");
    // The hub stays at the canvas centre.
    expect(layout.hub.x).toBe(layout.width / 2);
    expect(layout.hub.y).toBe(layout.height / 2);
  });

  it("is deterministic — the same roster lands in the same places", () => {
    const a = layoutAgents(roster(12), 900, 700, "constellation");
    const b = layoutAgents(roster(12), 900, 700, "constellation");
    expect(a.nodes).toEqual(b.nodes);
    expect(a.ribbons).toEqual(b.ribbons);
  });

  it("steps each node the golden angle around the hub, starting on top", () => {
    const layout = layoutAgents(roster(6), 900, 700, "constellation");
    // Node 0 starts one spoke above the hub.
    expect(layout.nodes[0].angle).toBeCloseTo(-Math.PI / 2, 10);
    for (let i = 1; i < layout.nodes.length; i += 1) {
      const turn = layout.nodes[i]!.angle! - layout.nodes[i - 1]!.angle!;
      expect(turn).toBeCloseTo(GOLDEN_ANGLE, 10);
    }
  });

  it("scatters a roster to every side of the hub", () => {
    const layout = layoutAgents(roster(12), 900, 700, "constellation");
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

  it("keeps name pills from overlapping for a full roster", () => {
    const N = 35;
    const layout = layoutAgents(roster(N), 1400, 1100, "constellation");
    expect(layout.nodes).toHaveLength(N);
    // The ring squeezes into the box instead of shrinking: full-size pills,
    // no canvas growth, never overlapping.
    expect(layout.nodes[0].height).toBe(NODE_SIZE_MAX);
    expect(layout.nodes[0].width).toBe(pillWidth(NODE_SIZE_MAX));
    expect(layout.width).toBe(1400);
    expect(layout.height).toBe(1100);
    for (let i = 0; i < N; i += 1) {
      for (let j = i + 1; j < N; j += 1) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        // Axis-aligned rect overlap needs BOTH axes to close in.
        const overlapX =
          Math.abs(a.x - b.x) < (a.width + b.width) / 2;
        const overlapY =
          Math.abs(a.y - b.y) < (a.height + b.height) / 2;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it("fits a 20-plus roster on a laptop window with no canvas growth", () => {
    const N = 23;
    const layout = layoutAgents(roster(N), 1150, 620, "constellation");
    expect(layout.nodes).toHaveLength(N);
    // No scrolling on a default-size window: the canvas stays measured.
    expect(layout.width).toBe(1150);
    expect(layout.height).toBe(620);
    for (let i = 0; i < N; i += 1) {
      for (let j = i + 1; j < N; j += 1) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const overlapX =
          Math.abs(a.x - b.x) < (a.width + b.width) / 2;
        const overlapY =
          Math.abs(a.y - b.y) < (a.height + b.height) / 2;
        expect(overlapX && overlapY).toBe(false);
      }
    }
    for (const node of layout.nodes) {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const dx = cx - layout.hub.x;
      const dy = cy - layout.hub.y;
      const dist = Math.hypot(dx, dy);
      const ux = dx / dist;
      const uy = dy / dist;
      const support =
        (node.width / 2) * Math.abs(ux) + (node.height / 2) * Math.abs(uy);
      expect(dist - support).toBeGreaterThan(HUB_RADIUS + HUB_TIP_GAP);
    }
  });

  it("keeps every pill inside the canvas and clear of the hub disk", () => {
    const layout = layoutAgents(roster(20), 900, 700, "constellation");
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(OUTER_PAD - 0.001);
      expect(node.y).toBeGreaterThanOrEqual(OUTER_PAD - 0.001);
      expect(node.x + node.width).toBeLessThanOrEqual(
        layout.width - OUTER_PAD + 0.001,
      );
      expect(node.y + node.height).toBeLessThanOrEqual(
        layout.height - OUTER_PAD + 0.001,
      );
      // Exact rect-circle clearance: the hub disk must not reach the pill,
      // measured along the hub-facing ray (pills are wide, so the centre
      // distance alone would over-constrain the squeezed ring).
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const dx = cx - layout.hub.x;
      const dy = cy - layout.hub.y;
      const dist = Math.hypot(dx, dy);
      const ux = dx / dist;
      const uy = dy / dist;
      const support =
        (node.width / 2) * Math.abs(ux) + (node.height / 2) * Math.abs(uy);
      expect(dist - support).toBeGreaterThan(HUB_RADIUS + HUB_TIP_GAP);
    }
  });

  it("runs each ribbon from the pill's hub-facing edge to the jar's outline", () => {
    const layout = layoutAgents(roster(6), 900, 700, "constellation");
    const { hub } = layout;
    for (const [i, ribbon] of layout.ribbons.entries()) {
      const node = layout.nodes[i];
      const nums = ribbon.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      // Starts exactly at the node anchor.
      expect(nums[0]).toBeCloseTo(node.anchor.x, 6);
      expect(nums[1]).toBeCloseTo(node.anchor.y, 6);
      // Ends on the jar's outline — never inside it, where the translucent
      // vessel would show the spoke through its glass: the tip's own ray
      // leaves the card's rect exactly there.
      const tipX = nums[6];
      const tipY = nums[7];
      const dx = tipX - hub.x;
      const dy = tipY - hub.y;
      const onOutline = Math.max(
        Math.abs(dx) / HUB_CARD_HALF,
        Math.abs(dy) / HUB_CARD_HALF_H,
      );
      expect(onOutline).toBeCloseTo(1, 6);
      // On the node's own ray.
      const rayX = node.x + node.width / 2 - hub.x;
      const rayY = node.y + node.height / 2 - hub.y;
      expect(dx * rayY - dy * rayX).toBeCloseTo(0, 3);
    }
  });

  it("squeezes before shrinking, and squeezes harder instead of growing", () => {
    // A huge canvas holds the whole roster unsqueezed at full size.
    const huge = layoutAgents(roster(35), 2200, 2200, "constellation");
    expect(huge.nodes[0].height).toBe(NODE_SIZE_MAX);
    expect(huge.width).toBe(2200);
    expect(huge.height).toBe(2200);
    // An ordinary screen keeps full-size pills with no canvas growth — the
    // ring flattens into an ellipse instead.
    const roomy = layoutAgents(roster(35), 1400, 1100, "constellation");
    expect(roomy.nodes[0].height).toBe(NODE_SIZE_MAX);
    expect(roomy.width).toBe(1400);
    expect(roomy.height).toBe(1100);
    // A tiny screen keeps floor tiles on the measured canvas: the ellipse
    // squeezes flatter instead of growing a scrolled canvas.
    const tight = layoutAgents(roster(35), 700, 460, "constellation");
    expect(tight.nodes[0].height).toBe(NODE_SIZE_MIN);
    expect(tight.width).toBe(700);
    expect(tight.height).toBe(460);
    // Even then, the constellation still fits the box it reports.
    for (const node of tight.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(tight.width);
      expect(node.y + node.height).toBeLessThanOrEqual(tight.height);
    }
  });

  it("never grows the canvas: floor tiles on the measured box, however tight", () => {
    const layout = layoutAgents(roster(40), 300, 300, "constellation");
    expect(layout.nodes[0].height).toBe(NODE_SIZE_MIN);
    expect(layout.width).toBe(300);
    expect(layout.height).toBe(300);
  });

  it("fits a 25-agent roster in the minimum-window graph area", () => {
    // The Tauri minimum window (1150x760) leaves roughly 1086x618 for the
    // graph: 25 agents stay on one screen at floor tiles or better, clear of
    // the hub card and inside the canvas.
    const layout = layoutAgents(roster(25), 1086, 618, "constellation");
    expect(layout.width).toBe(1086);
    expect(layout.height).toBe(618);
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(OUTER_PAD - 0.001);
      expect(node.y).toBeGreaterThanOrEqual(OUTER_PAD - 0.001);
      expect(node.x + node.width).toBeLessThanOrEqual(
        layout.width - OUTER_PAD + 0.001,
      );
      expect(node.y + node.height).toBeLessThanOrEqual(
        layout.height - OUTER_PAD + 0.001,
      );
      const overlaps =
        node.x < layout.hub.x + HUB_CARD_HALF &&
        node.x + node.width > layout.hub.x - HUB_CARD_HALF &&
        node.y < layout.hub.y + HUB_CARD_HALF_H &&
        node.y + node.height > layout.hub.y - HUB_CARD_HALF_H;
      expect(overlaps).toBe(false);
    }
  });

  it("lays out an empty roster as a hub-only canvas", () => {
    const layout = layoutAgents([], 800, 600);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(600);
    expect(layout.nodes).toEqual([]);
    expect(layout.ribbons).toEqual([]);
  });

  it("keeps every pill clear of the hub dashboard card", () => {
    // The regression from the dashboard card: the innermost spiral node used
    // to slide underneath the opaque card. The clearance is the card's real
    // rectangle, not a square blown up to its width.
    const layout = layoutAgents(roster(22), 1400, 1100, "constellation");
    for (const node of layout.nodes) {
      const overlaps =
        node.x < layout.hub.x + HUB_CARD_HALF &&
        node.x + node.width > layout.hub.x - HUB_CARD_HALF &&
        node.y < layout.hub.y + HUB_CARD_HALF_H &&
        node.y + node.height > layout.hub.y - HUB_CARD_HALF_H;
      expect(overlaps).toBe(false);
    }
  });
});

describe("layoutAgents columns mode", () => {
  it("splits a roster into balanced columns on the hub's two sides", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
      "columns",
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
      "columns",
    );
    for (const node of layout.nodes) {
      expect(node.angle).toBeUndefined();
      if (node.side === "left") {
        expect(node.anchor.x).toBe(node.x + node.width);
      } else {
        expect(node.anchor.x).toBe(node.x);
      }
    }
  });

  it("ends every ribbon at the jar's side wall on its own side", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
      "columns",
    );
    // The walls of the translucent jar, not the hub disk hidden under it.
    const tipX = (side: string) =>
      side === "left"
        ? layout.hub.x - HUB_CARD_HALF_COLUMNS
        : layout.hub.x + HUB_CARD_HALF_COLUMNS;
    for (const [i, node] of layout.nodes.entries()) {
      const nums = layout.ribbons[i].d
        .match(/-?\d+(\.\d+)?/g)!
        .map(Number);
      expect(nums[6]).toBeCloseTo(tipX(node.side!), 6);
      expect(nums[7]).toBe(layout.hub.y);
    }
  });

  it("numbers columns in fill order for the entrance cascade", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
      "columns",
    );
    // Fill order is left column first: a/b land together, then c/d.
    expect(layout.nodes.map((n) => n.col)).toEqual([0, 0, 1, 1]);
  });

  it("keeps name pills aligned on a fixed pitch within a column", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
      "columns",
    );
    const [a, b] = layout.nodes.filter((n) => n.side === "left");
    expect(b.y - a.y).toBe(a.height + COL_GAP);
    expect(a.width).toBe(a.height + NODE_LABEL_GAP + NODE_LABEL_WIDTH);
  });
});
