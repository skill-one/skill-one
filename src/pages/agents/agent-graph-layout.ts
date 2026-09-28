import type { AgentStatus } from "../../lib/skills-manager";

/**
 * The geometry of the agents page's constellation — a pure mapping from the
 * agent list and the canvas size to icon nodes, the SkillOne hub and the
 * ribbon paths that join them. One set of coordinates drives both the
 * absolutely-positioned HTML nodes and the SVG ribbons behind them, so the
 * two can never disagree, and the layout stays deterministic and unit
 * testable without a DOM.
 *
 * Nodes are placed by Vogel's phyllotaxis — the sunflower formula: each
 * agent steps the golden angle (~137.5°) around the hub while drifting out
 * with √index. The result looks casually scattered to every side of the hub
 * while staying evenly spaced and never overlapping; the same agent always
 * lands in the same place. A long roster shrinks the tile size before it
 * grows the canvas, so the constellation keeps fitting one screen.
 */

export interface Point {
  x: number;
  y: number;
}

/** Where the node's name tooltip opens, in screen-side terms. */
export type NodeTipSide = "left" | "right" | "top" | "bottom";

/** Which hub side a column-mode tile stands on. */
export type GraphSide = "left" | "right";

/**
 * The graph presentation: a Vogel scatter or the original balanced columns
 * on the hub's two sides.
 */
export type AgentsLayoutMode = "constellation" | "columns";

export interface NodeLayout {
  /** Agent id (`AgentStatus.name`). */
  name: string;
  /** Square tile box, in canvas coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Point on the tile edge the ribbon leaves from, facing the hub. */
  anchor: Point;
  /** The side its name tooltip opens toward — always away from the hub. */
  tipSide: NodeTipSide;
  /** Constellation mode: this node's polar angle around the hub (0 = east). */
  angle?: number;
  /** Columns mode: which side of the hub the tile stands on. */
  side?: GraphSide;
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

/** Tile size bounds: the constellation shrinks toward the floor to fit. */
export const NODE_SIZE_MAX = 48;
export const NODE_SIZE_MIN = 30;
/** Gap between neighbouring tiles at the largest size; scales down slightly. */
export const NODE_GAP_MAX = 6;
export const NODE_GAP_MIN = 4;

/** Hub geometry: the disk every ribbon converges on. */
export const HUB_RADIUS = 48;
export const HUB_TIP_GAP = 10;
/**
 * The shortest ribbon, between the hub rim and the innermost tile. Kept long
 * enough to read as a spoke, not a stub — the first node sits a full tile's
 * breath away from the disk.
 */
export const RIBBON_MIN = 34;
/** Clearance kept between the outermost tile and the canvas edge. */
export const OUTER_PAD = 14;

/** Canvas size used until the first real measurement lands. */
export const DEFAULT_GRAPH_WIDTH = 720;
export const DEFAULT_GRAPH_HEIGHT = 520;

/**
 * The golden angle — π(3−√5) ≈ 137.508°. Each node rotates by it around the
 * hub, which is what makes consecutive nodes land in fresh directions while
 * the packing as a whole stays even.
 */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/**
 * Phyllotaxis density: with `r = r0 + k·spacing·√index` a square tile needs
 * k ≈ 0.62 for axis-aligned neighbours never to overlap (verified across up
 * to 35 nodes).
 */
const DENSITY_K = 0.62;
/** Where the spiral starts — one tile above the hub (angle 0 points east). */
const ANGLE_OFFSET = -Math.PI / 2;
/** Canvas room an outward name tooltip needs before it is diverted up/down. */
const TIP_SIDE_REQUIRE = 96;

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
 * One constellation ribbon: a cubic that bows tangentially as it approaches
 * the hub, every ribbon curling the same handedness — a quiet galaxy swirl
 * rather than a fan of straight spokes. Control points run along the chord
 * with a fixed perpendicular bow, so the curve stays gentle on short spokes
 * and never kinks.
 */
export function swirlPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // 90° counterclockwise normal: one shared handedness for every spoke.
  const nx = -uy;
  const ny = ux;
  const pull = Math.min(Math.max(len * 0.42, 14), 64);
  const bow = pull * 0.42;
  const c1x = from.x + ux * pull + nx * bow;
  const c1y = from.y + uy * pull + ny * bow;
  const c2x = to.x - ux * pull + nx * bow;
  const c2y = to.y - uy * pull + ny * bow;
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
}

/**
 * One columns-mode ribbon: a cubic with horizontal tangents — the original
 * S-curve. The control-point pull is clamped so short ribbons still read as
 * curves, and its sign follows the run's direction so a right-hand tile
 * curves into the hub the way its mirror on the left does.
 */
export function sCurvePath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const pull = Math.max(48, Math.abs(dx) * 0.52) * (dx >= 0 ? 1 : -1);
  return `M ${from.x} ${from.y} C ${from.x + pull} ${from.y}, ${to.x - pull} ${to.y}, ${to.x} ${to.y}`;
}

/** The gap that pairs with a tile size (slightly tighter as tiles shrink). */
function gapFor(size: number): number {
  if (size <= NODE_SIZE_MIN) return NODE_GAP_MIN;
  const t = (size - NODE_SIZE_MIN) / (NODE_SIZE_MAX - NODE_SIZE_MIN);
  return NODE_GAP_MIN + t * (NODE_GAP_MAX - NODE_GAP_MIN);
}

/** Radius of the outermost tile's centre for a given roster and tile size. */
function outerRadius(agentCount: number, size: number): number {
  const spacing = size + gapFor(size);
  const r0 = HUB_RADIUS + HUB_TIP_GAP + size / 2 + RIBBON_MIN;
  const last = agentCount > 0 ? Math.sqrt(agentCount - 1) : 0;
  return r0 + DENSITY_K * spacing * last;
}

/**
 * The largest tile size that keeps the whole constellation inside
 * `availableRadius`; the floor, when even it cannot fit, lets the canvas grow.
 */
function resolveTileSize(agentCount: number, availableRadius: number): number {
  for (let size = NODE_SIZE_MAX; size >= NODE_SIZE_MIN; size -= 1) {
    if (outerRadius(agentCount, size) + size / 2 <= availableRadius) {
      return size;
    }
  }
  return NODE_SIZE_MIN;
}

/**
 * The canvas width for a measured container: the measured width once it
 * exists (the constellation is circular and fits the smaller dimension), the
 * default before any measurement.
 */
export function resolveGraphWidth(measuredWidth: number): number {
  return measuredWidth > 0 ? measuredWidth : DEFAULT_GRAPH_WIDTH;
}

/** Where one node's tooltip opens: outward while the canvas edge holds it. */
function resolveTipSide(angle: number, cx: number, width: number): NodeTipSide {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const outwardX = cos >= 0 ? width - cx : cx;
  if (Math.abs(cos) >= Math.abs(sin)) {
    // Facing horizontally: keep it outward when there is room, otherwise flip
    // it vertically so it never folds back over the ribbon.
    if (outwardX >= TIP_SIDE_REQUIRE) return cos >= 0 ? "right" : "left";
  }
  return sin >= 0 ? "bottom" : "top";
}

/** Column-mode geometry: one bare icon tile per row. */
const COL_TILE = NODE_SIZE_MAX;
const COL_GAP = 14;
const COL_PITCH = COL_TILE + COL_GAP;
/** Vertical pad and the clear central lane for the hub. */
const COL_PAD_TOP = 28;
const COL_PAD_BOTTOM = 28;
const COL_HUB_LANE = HUB_RADIUS + HUB_TIP_GAP + 24;
/** Gutter outside the outermost column, holding the outward name tooltip. */
const COL_TIP_GUTTER = 104;
/** The narrowest the columns canvas renders; below it the page scrolls. */
const COL_MIN_WIDTH =
  2 * (COL_HUB_LANE + COL_TILE) + 2 * COL_TIP_GUTTER;

/** The height of an icon column holding `count` tiles. */
function columnHeight(count: number): number {
  return count > 0 ? count * COL_TILE + (count - 1) * COL_GAP : 0;
}

/**
 * The original presentation: balanced icon columns on the hub's left and
 * right, opening more columns outward as the roster grows or the canvas
 * shortens. Ribbons cross the clear central lane on horizontal S-curves.
 */
function layoutColumns(
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
    const half =
      measuredW / 2 - COL_TIP_GUTTER - COL_HUB_LANE + COL_GAP;
    return Math.max(1, Math.floor(half / (COL_TILE + COL_GAP)));
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

  const tallest = columns.reduce((max, col) => Math.max(max, col.length), 0);
  const height = Math.max(
    measuredH,
    columnHeight(tallest) + COL_PITCH / 2 + COL_PAD_TOP + COL_PAD_BOTTOM,
  );
  const width = Math.max(measuredW, COL_MIN_WIDTH);
  const hub = { x: width / 2, y: height / 2, radius: HUB_RADIUS };
  const tipLeft: Point = { x: hub.x - HUB_RADIUS - HUB_TIP_GAP, y: hub.y };
  const tipRight: Point = { x: hub.x + HUB_RADIUS + HUB_TIP_GAP, y: hub.y };

  const byName = new Map<string, NodeLayout>();
  columns.forEach((column, c) => {
    const side: GraphSide = c % 2 === 0 ? "left" : "right";
    // Rank counts columns inward from the gutter: 0 is the outermost pair.
    const rank = Math.floor(c / 2);
    const x =
      side === "left"
        ? COL_TIP_GUTTER + rank * (COL_TILE + COL_GAP)
        : width - COL_TIP_GUTTER - COL_TILE - rank * (COL_TILE + COL_GAP);
    // The two sides sit half a pitch apart, so their rows interlock.
    const stagger = side === "left" ? -COL_PITCH / 4 : COL_PITCH / 4;
    const top = hub.y - columnHeight(column.length) / 2 + stagger;
    column.forEach((agent, row) => {
      const y = top + row * COL_PITCH;
      byName.set(agent.name, {
        name: agent.name,
        side,
        x,
        y,
        width: COL_TILE,
        height: COL_TILE,
        anchor: {
          x: side === "left" ? x + COL_TILE : x,
          y: y + COL_TILE / 2,
        },
        tipSide: side === "left" ? "left" : "right",
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

/**
 * Lay every agent out around the SkillOne hub. `mode` picks the
 * presentation: the Vogel constellation (default) or the original balanced
 * columns.
 */
export function layoutAgents(
  agents: readonly AgentStatus[],
  measuredWidth: number,
  measuredHeight: number,
  mode: AgentsLayoutMode = "constellation",
): GraphLayout {
  if (mode === "columns") {
    return layoutColumns(agents, measuredWidth, measuredHeight);
  }
  return layoutConstellation(agents, measuredWidth, measuredHeight);
}

/**
 * Lay every agent out around the SkillOne hub on a Vogel spiral: the hub
 * sits at the canvas centre, node 0 rests one spoke above it, and every
 * further node steps the golden angle and drifts outward with √index. The
 * tile size shrinks (down to a floor) to keep a long roster inside the
 * measured canvas; only when the floor cannot fit does the canvas grow and
 * the page scroll.
 */
function layoutConstellation(
  agents: readonly AgentStatus[],
  measuredWidth: number,
  measuredHeight: number,
): GraphLayout {
  const measuredW = measuredWidth > 0 ? measuredWidth : DEFAULT_GRAPH_WIDTH;
  const measuredH = measuredHeight > 0 ? measuredHeight : DEFAULT_GRAPH_HEIGHT;

  const availableRadius = Math.min(measuredW, measuredH) / 2 - OUTER_PAD;
  const size = resolveTileSize(agents.length, availableRadius);

  // The constellation is circular: once the floor tile size still cannot fit
  // the measured box, grow a square canvas enough to hold it.
  const needed = (outerRadius(agents.length, size) + size / 2 + OUTER_PAD) * 2;
  const width = Math.max(measuredW, needed);
  const height = Math.max(measuredH, needed);
  const hub = { x: width / 2, y: height / 2, radius: HUB_RADIUS };

  const spacing = size + gapFor(size);
  const r0 = HUB_RADIUS + HUB_TIP_GAP + size / 2 + RIBBON_MIN;

  const nodes: NodeLayout[] = agents.map((agent, i) => {
    const angle = ANGLE_OFFSET + i * GOLDEN_ANGLE;
    const radius = r0 + DENSITY_K * spacing * Math.sqrt(i);
    const cx = hub.x + radius * Math.cos(angle);
    const cy = hub.y + radius * Math.sin(angle);
    // The ribbon leaves from the tile edge facing the hub and arrives at the
    // hub rim on the same ray, so the spoke is one straight radial line the
    // curve gently bows along.
    const ux = -Math.cos(angle);
    const uy = -Math.sin(angle);
    const anchor = { x: cx + ux * (size / 2), y: cy + uy * (size / 2) };
    return {
      name: agent.name,
      x: cx - size / 2,
      y: cy - size / 2,
      width: size,
      height: size,
      anchor,
      tipSide: resolveTipSide(angle, cx, width),
      angle,
    };
  });

  const ribbons: RibbonLayout[] = nodes.map((node, i) => {
    const angle = ANGLE_OFFSET + i * GOLDEN_ANGLE;
    const tip = {
      x: hub.x + (HUB_RADIUS + HUB_TIP_GAP) * Math.cos(angle),
      y: hub.y + (HUB_RADIUS + HUB_TIP_GAP) * Math.sin(angle),
    };
    return { name: node.name, d: swirlPath(node.anchor, tip) };
  });

  return { width, height, nodes, ribbons, hub };
}
