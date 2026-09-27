import type { AgentStatus } from "../../lib/skills-manager";

/**
 * The geometry of the agents page's hub-and-spoke graph — a pure mapping from
 * the agent list and the canvas size to node cards, the SkillOne hub and the
 * ribbon paths that join them. One set of coordinates drives both the
 * absolutely-positioned HTML cards and the SVG ribbons behind them, so the two
 * can never disagree, and the layout stays deterministic and unit testable
 * without a DOM.
 *
 * The hub sits at the centre; agents are split into balanced columns on its
 * left and right, so a long roster grows sideways instead of off the bottom of
 * one tall column. Columns pack from the outer edge inward and every ribbon
 * crosses the clear central lane to reach the hub.
 */

export interface Point {
  x: number;
  y: number;
}

/** Which side of the hub a card column stands on. */
export type GraphSide = "left" | "right";

export interface NodeLayout {
  /** Agent id (`AgentStatus.name`). */
  name: string;
  /** The hub side the card belongs to. */
  side: GraphSide;
  /** Card box, in canvas coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Center of the card's hub-facing edge — where its ribbon leaves. */
  anchor: Point;
}

export interface RibbonLayout {
  name: string;
  /** SVG path from the node's anchor to the hub's tip on its side. */
  d: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: NodeLayout[];
  ribbons: RibbonLayout[];
  hub: { x: number; y: number; radius: number };
}

/** Card column geometry. */
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 40;
export const NODE_GAP = 12;
/** Vertical pitch of a card column — one card plus the gap below it. */
export const NODE_PITCH = NODE_HEIGHT + NODE_GAP;
/** Horizontal gap between the columns of one side. */
export const COLUMN_GAP = NODE_GAP;

/** Outer margin of the canvas. */
export const GRAPH_PAD_X = 8;
export const GRAPH_PAD_TOP = 28;
export const GRAPH_PAD_BOTTOM = 28;

/** Hub geometry: the circle every ribbon converges on. */
export const HUB_RADIUS = 46;
export const HUB_TIP_GAP = 10;
/**
 * The narrowest central lane kept clear of cards for the hub. Columns pack
 * outward from the canvas edges, so a wider canvas only ever widens this gap.
 */
export const HUB_LANE_MIN = HUB_RADIUS + HUB_TIP_GAP + 24;

/** Canvas size used until the first real measurement lands. */
export const DEFAULT_GRAPH_WIDTH = 720;
export const DEFAULT_GRAPH_HEIGHT = 520;

/**
 * The narrowest the canvas renders at: below it a single column per side would
 * collide with the hub lane, so the canvas keeps this width and lets the page
 * scroll sideways instead.
 */
export const MIN_GRAPH_WIDTH =
  2 * (HUB_LANE_MIN + NODE_WIDTH) + 2 * GRAPH_PAD_X;

/**
 * The five ribbon hues of the Skill One mark, in its top-to-bottom order.
 * Each agent keeps a stable hue drawn from this palette.
 */
export const RIBBON_COLORS = [
  "#2E7FD9", // blue
  "#2FCB9F", // teal
  "#9535D4", // purple
  "#ED4B8E", // pink
  "#F49B1F", // orange
] as const;

/** Agents whose directory already holds content read in amber, not a brand hue. */
export const WARNING_COLOR = "#f59e0b";

/**
 * Stable string hash → palette index, so an agent keeps its hue regardless of
 * list order, and adding one agent never recolours the rest.
 */
export function ribbonColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % RIBBON_COLORS.length;
}

export function ribbonColor(name: string): string {
  return RIBBON_COLORS[ribbonColorIndex(name)];
}

/**
 * One ribbon: a cubic bezier between two points with horizontal tangents — the
 * same S-curve family the brand mark's ribbons use. The control-point pull is
 * clamped so very short ribbons still read as curves rather than kinks, and its
 * sign follows the run's direction so a right-hand card's ribbon curves into
 * the hub the way its mirror on the left does.
 */
export function ribbonPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const pull = Math.max(48, Math.abs(dx) * 0.52) * (dx >= 0 ? 1 : -1);
  return `M ${from.x} ${from.y} C ${from.x + pull} ${from.y}, ${to.x - pull} ${to.y}, ${to.x} ${to.y}`;
}

/**
 * The canvas width for a measured container: the measured width itself once it
 * is wide enough to keep the hub clear of the cards, the minimum canvas width
 * below that (the page scrolls the overflow), and the default before any
 * measurement exists.
 */
export function resolveGraphWidth(measuredWidth: number): number {
  if (measuredWidth <= 0) return DEFAULT_GRAPH_WIDTH;
  return Math.max(measuredWidth, MIN_GRAPH_WIDTH);
}

/** The height of a column holding `count` cards, before the top/bottom pad. */
function columnHeight(count: number): number {
  return count > 0 ? count * NODE_HEIGHT + (count - 1) * NODE_GAP : 0;
}

/**
 * How many cards one column can hold without the canvas overflowing `height`:
 * the pad and the half-pitch stagger between the two sides are subtracted
 * first, then as many whole pitches as fit.
 */
function rowsThatFit(height: number): number {
  const usable = height - GRAPH_PAD_TOP - GRAPH_PAD_BOTTOM - NODE_PITCH / 2;
  return Math.max(1, Math.floor((usable + NODE_GAP) / NODE_PITCH));
}

/** How many card columns fit on each side of the hub for a canvas `width`. */
function columnsPerSide(width: number): number {
  const half = width / 2 - GRAPH_PAD_X - HUB_LANE_MIN + COLUMN_GAP;
  return Math.max(1, Math.floor(half / (NODE_WIDTH + COLUMN_GAP)));
}

/**
 * Lay every agent out around the SkillOne hub: the hub sits at the canvas
 * centre, agents fill balanced columns on its left and right (packing from the
 * outer edge inward, the two sides offset by half a pitch), and each ribbon
 * runs from the card's hub-facing edge into the hub's tip on its own side.
 *
 * The column count is driven by the measured height — enough columns are opened
 * to keep every column within it, capped by how many the width can hold — so a
 * long roster stays on one screen instead of growing a single column past the
 * bottom. The canvas keeps the measured height when the cards fit and only
 * grows (letting the page scroll) when they cannot.
 */
export function layoutAgents(
  agents: readonly AgentStatus[],
  measuredWidth: number,
  measuredHeight: number,
): GraphLayout {
  const width = measuredWidth > 0 ? measuredWidth : DEFAULT_GRAPH_WIDTH;
  const height = measuredHeight > 0 ? measuredHeight : DEFAULT_GRAPH_HEIGHT;

  const maxColumns = 2 * columnsPerSide(width);
  const needed = Math.max(1, Math.ceil(agents.length / rowsThatFit(height)));
  let columnCount = Math.max(1, Math.min(needed, maxColumns));
  // Keep the hub centred: beyond a lone card, always fill both sides evenly.
  if (agents.length > 1 && columnCount % 2 === 1 && columnCount < maxColumns) {
    columnCount += 1;
  }

  // Split the agents into balanced, contiguous columns — earlier columns take
  // the odd remainder so the reading order runs top-to-bottom, left to right.
  const perColumn = Math.floor(agents.length / columnCount);
  const remainder = agents.length % columnCount;
  const columns: AgentStatus[][] = [];
  let cursor = 0;
  for (let c = 0; c < columnCount; c += 1) {
    const size = perColumn + (c < remainder ? 1 : 0);
    columns.push(agents.slice(cursor, cursor + size));
    cursor += size;
  }

  const tallest = columns.reduce((max, col) => Math.max(max, col.length), 0);
  const canvasHeight = Math.max(
    height,
    columnHeight(tallest) + NODE_PITCH / 2 + GRAPH_PAD_TOP + GRAPH_PAD_BOTTOM,
  );
  const hub = { x: width / 2, y: canvasHeight / 2, radius: HUB_RADIUS };
  const tipLeft: Point = { x: hub.x - HUB_RADIUS - HUB_TIP_GAP, y: hub.y };
  const tipRight: Point = { x: hub.x + HUB_RADIUS + HUB_TIP_GAP, y: hub.y };

  const byName = new Map<string, NodeLayout>();
  columns.forEach((column, c) => {
    const side: GraphSide = c % 2 === 0 ? "left" : "right";
    // Rank counts columns outward from the hub: 0 is the innermost pair.
    const rank = Math.floor(c / 2);
    const x =
      side === "left"
        ? GRAPH_PAD_X + rank * (NODE_WIDTH + COLUMN_GAP)
        : width - GRAPH_PAD_X - NODE_WIDTH - rank * (NODE_WIDTH + COLUMN_GAP);
    // The two sides sit half a pitch apart, so their rows interlock instead of
    // marching in lockstep.
    const stagger = side === "left" ? -NODE_PITCH / 4 : NODE_PITCH / 4;
    const top = hub.y - columnHeight(column.length) / 2 + stagger;
    column.forEach((agent, row) => {
      const y = top + row * NODE_PITCH;
      byName.set(agent.name, {
        name: agent.name,
        side,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        anchor: {
          x: side === "left" ? x + NODE_WIDTH : x,
          y: y + NODE_HEIGHT / 2,
        },
      });
    });
  });

  const nodes = agents.map((agent) => byName.get(agent.name)!);
  const ribbons = nodes.map((node) => ({
    name: node.name,
    d: ribbonPath(node.anchor, node.side === "left" ? tipLeft : tipRight),
  }));

  return { width, height: canvasHeight, nodes, ribbons, hub };
}
