import type { AgentStatus } from "../../lib/skills-manager";

/**
 * The geometry of the agents page's hub-and-spoke graph — a pure mapping from
 * the agent list and the canvas width to node cards, the SkillOne hub and the
 * ribbon paths that join them. One set of coordinates drives both the
 * absolutely-positioned HTML cards and the SVG ribbons behind them, so the two
 * can never disagree, and the logo-like layout stays deterministic and unit
 * testable without a DOM.
 */

export interface Point {
  x: number;
  y: number;
}

export interface NodeLayout {
  /** Agent id (`AgentStatus.name`). */
  name: string;
  /** Card box, in canvas coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Center of the card's hub-facing (right) edge — where its ribbon leaves. */
  anchor: Point;
}

export interface RibbonLayout {
  name: string;
  /** SVG path from the node's anchor to the hub's tip. */
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
export const NODE_X = 8;
export const NODE_WIDTH = 236;
export const NODE_HEIGHT = 58;
export const NODE_GAP = 14;
export const GRAPH_PAD_TOP = 28;
export const GRAPH_PAD_BOTTOM = 28;

/** Hub geometry: the circle every ribbon converges on. */
export const HUB_RADIUS = 46;
export const HUB_RIGHT_INSET = 150;
export const HUB_TIP_GAP = 10;

/** Width used until the first real measurement lands (and in layout-less DOM). */
export const DEFAULT_GRAPH_WIDTH = 720;

/**
 * The narrowest the graph renders at: below it the hub would overlap the card
 * column, so the canvas keeps this width and lets the page scroll sideways
 * instead. Desktop windows never reach it in practice; it guards the floor.
 */
export const MIN_GRAPH_WIDTH = 620;

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
 * clamped so very short ribbons still read as curves rather than kinks.
 */
export function ribbonPath(from: Point, to: Point): string {
  const pull = Math.max(48, Math.abs(to.x - from.x) * 0.52);
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

/**
 * Lay every agent out as a vertical card column on the left, with the SkillOne
 * hub fixed at the column's vertical centre on the right. The canvas grows
 * with the column (the page owns the scroll), so every agent keeps the same
 * card pitch no matter how many are detected.
 */
export function layoutAgents(
  agents: readonly AgentStatus[],
  measuredWidth: number,
): GraphLayout {
  const width = measuredWidth > 0 ? measuredWidth : DEFAULT_GRAPH_WIDTH;
  const height =
    GRAPH_PAD_TOP +
    (agents.length > 0
      ? agents.length * NODE_HEIGHT + (agents.length - 1) * NODE_GAP
      : 0) +
    GRAPH_PAD_BOTTOM;

  const hub = {
    x: width - HUB_RIGHT_INSET,
    y: height / 2,
    radius: HUB_RADIUS,
  };
  const tip: Point = { x: hub.x - hub.radius - HUB_TIP_GAP, y: hub.y };

  const nodes = agents.map((agent, i) => {
    const y = GRAPH_PAD_TOP + i * (NODE_HEIGHT + NODE_GAP);
    return {
      name: agent.name,
      x: NODE_X,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      anchor: { x: NODE_X + NODE_WIDTH, y: y + NODE_HEIGHT / 2 },
    };
  });

  const ribbons = agents.map((agent, i) => ({
    name: agent.name,
    d: ribbonPath(nodes[i].anchor, tip),
  }));

  return { width, height, nodes, ribbons, hub };
}
