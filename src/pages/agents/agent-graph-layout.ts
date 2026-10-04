import type { AgentStatus } from "../../lib/skills-manager";

/**
 * The geometry of the agents page: symmetrical dual columns flanking
 * the central SkillOne hub card, joined by horizontal S-curve ribbons.
 * Deterministic and unit-testable without a DOM.
 */

export interface Point {
  x: number;
  y: number;
}

/** Which hub side a column-mode tile stands on. */
export type GraphSide = "left" | "right";

export interface NodeLayout {
  /** Agent id (`AgentStatus.name`). */
  name: string;
  /** Pill box (icon plus name label), in canvas coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Point where the ribbon leaves the pill, on the edge facing the hub. */
  anchor: Point;
  /** Which side of the hub the tile stands on. */
  side: GraphSide;
  /**
   * Zero-based column index (0 fills first). Drives the
   * entrance cascade — one column lands at a time, centre pair first.
   */
  col: number;
}

export interface RibbonLayout {
  name: string;
  /** SVG path from the node's anchor to the hub's rim. */
  d: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: NodeLayout[];
  ribbons: RibbonLayout[];
  hub: { x: number; y: number; radius: number };
}

/** Node height bounds for the compact pill. */
export const NODE_SIZE_MAX = 36;
export const NODE_LABEL_WIDTH = 96;
export const NODE_LABEL_GAP = 8;
export const OUTER_PAD = 14;

export const HUB_RADIUS = 48;
export const HUB_TIP_GAP = 10;
export const HUB_CARD_HALF_COLUMNS = 240;
export const HUB_CARD_HALF = 240;
export const HUB_CARD_HALF_H = 150;

export const DEFAULT_GRAPH_WIDTH = 720;
export const DEFAULT_GRAPH_HEIGHT = 520;

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
 * One column-mode ribbon: a horizontal S-curve leaving the pill's hub-facing
 * edge horizontally and arriving horizontally at the hub's side rim.
 */
export function sCurvePath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const c1x = from.x + dx * 0.5;
  const c2x = from.x + dx * 0.5;
  return `M ${from.x} ${from.y} C ${c1x} ${from.y} ${c2x} ${to.y} ${to.x} ${to.y}`;
}

export function resolveGraphWidth(measuredWidth: number): number {
  return measuredWidth > 0 ? measuredWidth : DEFAULT_GRAPH_WIDTH;
}

/** Column-mode geometry: one icon-plus-name pill per row. */
export const COL_TILE = NODE_SIZE_MAX;
export const COL_PILL = COL_TILE + NODE_LABEL_GAP + NODE_LABEL_WIDTH;
export const COL_GAP = 10;
export const COL_PITCH = COL_TILE + COL_GAP;
export const COL_PAD_TOP = 28;
export const COL_PAD_BOTTOM = 28;
export const COL_HUB_LANE = HUB_CARD_HALF_COLUMNS + HUB_TIP_GAP + 20;

/** The height of an icon column holding `count` tiles. */
export function columnHeight(count: number): number {
  return count > 0 ? count * COL_TILE + (count - 1) * COL_GAP : 0;
}

/**
 * Lay every agent out symmetrically flanking the SkillOne hub card.
 */
export function layoutAgents(
  agents: readonly AgentStatus[],
  measuredWidth: number,
  measuredHeight: number,
): GraphLayout {
  const measuredW = measuredWidth > 0 ? measuredWidth : DEFAULT_GRAPH_WIDTH;
  const measuredH = measuredHeight > 0 ? measuredHeight : DEFAULT_GRAPH_HEIGHT;

  const rowsThatFit = () => {
    const usable =
      measuredH - COL_PAD_TOP - COL_PAD_BOTTOM - COL_PITCH / 2;
    return Math.max(1, Math.floor((usable + COL_GAP) / COL_PITCH));
  };
  const columnsPerSide = () => {
    const half = measuredW / 2 - OUTER_PAD - COL_HUB_LANE + COL_GAP;
    return Math.max(1, Math.floor(half / (COL_PILL + COL_GAP)));
  };

  const maxColumns = 2 * columnsPerSide();
  const needed = Math.max(1, Math.ceil(agents.length / rowsThatFit()));
  let columnCount = Math.max(1, Math.min(needed, maxColumns));
  // Keep the hub centred: beyond a lone tile, always fill both sides evenly.
  if (agents.length > 1 && columnCount % 2 === 1 && columnCount < maxColumns) {
    columnCount += 1;
  }

  // Balanced, contiguous columns — earlier columns take the odd remainder so
  // the reading order runs top-to-bottom, left to right.
  const perColumn = Math.floor(agents.length / columnCount);
  const remainder = agents.length % columnCount;
  const columns: AgentStatus[][] = [];
  let cursor = 0;
  for (let c = 0; c < columnCount; c += 1) {
    const size = perColumn + (c < remainder ? 1 : 0);
    columns.push(agents.slice(cursor, cursor + size));
    cursor += size;
  }

  const height = measuredH;
  const width = measuredW;
  const hub = { x: width / 2, y: height / 2, radius: HUB_RADIUS };
  const tipLeft: Point = { x: hub.x - HUB_CARD_HALF_COLUMNS, y: hub.y };
  const tipRight: Point = { x: hub.x + HUB_CARD_HALF_COLUMNS, y: hub.y };

  const byName = new Map<string, NodeLayout>();
  columns.forEach((column, c) => {
    const side: GraphSide = c % 2 === 0 ? "left" : "right";
    const rank = Math.floor(c / 2);
    const x =
      side === "left"
        ? OUTER_PAD + rank * (COL_PILL + COL_GAP)
        : width - OUTER_PAD - COL_PILL - rank * (COL_PILL + COL_GAP);
    const stagger = side === "left" ? -COL_PITCH / 4 : COL_PITCH / 4;
    const top = hub.y - columnHeight(column.length) / 2 + stagger;
    column.forEach((agent, row) => {
      const y = top + row * COL_PITCH;
      byName.set(agent.name, {
        name: agent.name,
        side,
        col: c,
        x,
        y,
        width: COL_PILL,
        height: COL_TILE,
        anchor: {
          x: side === "left" ? x + COL_PILL : x,
          y: y + COL_TILE / 2,
        },
      });
    });
  });

  const nodes = agents.map((agent) => byName.get(agent.name)!);
  const ribbons = nodes.map((node) => ({
    name: node.name,
    d: sCurvePath(node.anchor, node.side === "left" ? tipLeft : tipRight),
  }));

  return { width, height, nodes, ribbons, hub };
}
