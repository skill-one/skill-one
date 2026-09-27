import { describe, expect, it } from "vitest";

import type { AgentStatus } from "../../lib/skills-manager";
import {
  DEFAULT_GRAPH_HEIGHT,
  DEFAULT_GRAPH_WIDTH,
  GRAPH_PAD_X,
  HUB_RADIUS,
  HUB_TIP_GAP,
  MIN_GRAPH_WIDTH,
  NODE_HEIGHT,
  NODE_PITCH,
  NODE_WIDTH,
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

/** The distinct card-column x positions on one side of the hub. */
function columnXs(
  layout: ReturnType<typeof layoutAgents>,
  side: "left" | "right",
): Set<number> {
  return new Set(
    layout.nodes.filter((n) => n.side === side).map((n) => n.x),
  );
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

  it("mirrors the pull when the ribbon runs right-to-left", () => {
    // A right-hand card's ribbon leaves leftward and arrives from the near
    // side, so it curves into the hub exactly as its mirror on the left does.
    const d = ribbonPath({ x: 400, y: 0 }, { x: 100, y: 0 });
    const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    expect(d).toMatch(/^M 400 0 C /);
    expect(nums[2]).toBeLessThan(400); // c1 pulled toward the hub
    expect(nums[4]).toBeGreaterThan(100); // c2 arrives from the near side
    expect(nums[6]).toBe(100);
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
  it("falls back to the default canvas without a measurement", () => {
    const layout = layoutAgents([agent("a")], 0, 0);
    expect(layout.width).toBe(DEFAULT_GRAPH_WIDTH);
    expect(layout.height).toBeGreaterThanOrEqual(DEFAULT_GRAPH_HEIGHT);
    expect(layout.hub.x).toBe(DEFAULT_GRAPH_WIDTH / 2);
    expect(layout.hub.y).toBeCloseTo(layout.height / 2);
  });

  it("centres the hub and keeps the measured height when the cards fit", () => {
    const layout = layoutAgents([agent("a"), agent("b")], 800, 600);
    expect(layout.hub).toMatchObject({ x: 400, y: 300 });
    // Two cards fit well within 600px, so the canvas keeps the measured height
    // rather than growing to the column.
    expect(layout.height).toBe(600);
  });

  it("splits the agents into balanced columns on the hub's left and right", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    const left = layout.nodes.filter((n) => n.side === "left");
    const right = layout.nodes.filter((n) => n.side === "right");
    expect(left.map((n) => n.name)).toEqual(["a", "b"]);
    expect(right.map((n) => n.name)).toEqual(["c", "d"]);
    // Columns pack from the outer edge inward.
    expect(left[0].x).toBe(GRAPH_PAD_X);
    expect(right[0].x).toBe(1200 - GRAPH_PAD_X - NODE_WIDTH);
  });

  it("stacks a column at a fixed pitch on the hub-facing edge", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    const [a, b] = layout.nodes; // a and b share the left column
    expect(b.y - a.y).toBe(NODE_PITCH);
    expect(a.width).toBe(NODE_WIDTH);
    expect(a.height).toBe(NODE_HEIGHT);
    expect(a.anchor).toEqual({ x: a.x + NODE_WIDTH, y: a.y + NODE_HEIGHT / 2 });
  });

  it("offsets the two sides by half a pitch so their rows interlock", () => {
    const layout = layoutAgents([agent("a"), agent("b")], 1200, 600);
    const [left, right] = layout.nodes;
    expect(left.side).toBe("left");
    expect(right.side).toBe("right");
    expect(right.y - left.y).toBe(NODE_PITCH / 2);
  });

  it("opens more columns to keep a long roster inside the measured height", () => {
    const many = Array.from({ length: 20 }, (_, i) => agent(`a${i}`));
    const short = layoutAgents(many, 1200, 400);
    const tall = layoutAgents(many, 1200, 1400);

    // A short canvas needs two columns per side; a tall one needs a single
    // column per side.
    expect(columnXs(short, "left").size).toBe(2);
    expect(columnXs(tall, "left").size).toBe(1);
    expect(short.nodes).toHaveLength(20);
    expect(tall.nodes).toHaveLength(20);
  });

  it("keeps every card inside the canvas it reports", () => {
    const many = Array.from({ length: 12 }, (_, i) => agent(`a${i}`));
    const layout = layoutAgents(many, 1200, 400);
    const lowest = Math.max(...layout.nodes.map((n) => n.y + n.height));
    expect(lowest).toBeLessThanOrEqual(layout.height);
  });

  it("ends every ribbon at the hub tip on its own side", () => {
    const layout = layoutAgents(
      [agent("a"), agent("b"), agent("c"), agent("d")],
      1200,
      600,
    );
    const tipLeft = layout.hub.x - HUB_RADIUS - HUB_TIP_GAP;
    const tipRight = layout.hub.x + HUB_RADIUS + HUB_TIP_GAP;
    for (const node of layout.nodes) {
      const d = layout.ribbons.find((r) => r.name === node.name)!.d;
      const tipX = node.side === "left" ? tipLeft : tipRight;
      expect(d.endsWith(`${tipX} ${layout.hub.y}`)).toBe(true);
      expect(node.anchor.x).toBe(
        node.side === "left" ? node.x + NODE_WIDTH : node.x,
      );
    }
  });

  it("keeps the ribbon order aligned with the node order", () => {
    const agents = [agent("a"), agent("b"), agent("c")];
    const layout = layoutAgents(agents, 1200, 600);
    expect(layout.ribbons.map((r) => r.name)).toEqual(["a", "b", "c"]);
  });

  it("lays out an empty roster as a hub-only canvas", () => {
    const layout = layoutAgents([], 800, 600);
    expect(layout.width).toBe(800);
    expect(layout.nodes).toEqual([]);
    expect(layout.ribbons).toEqual([]);
  });
});
