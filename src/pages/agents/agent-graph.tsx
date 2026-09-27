import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";

import type { AgentStatus } from "../../lib/skills-manager";
import { agentLinkState } from "../../lib/agent-link-state";
import { useAgentLinkToggle } from "../../hooks/use-agent-link-toggle";
import { AgentIcon } from "../../components/agent-icon";
import { cn } from "../../lib/utils";
import {
  HUB_RADIUS,
  NODE_HEIGHT,
  layoutAgents,
  resolveGraphWidth,
  ribbonColor,
  type GraphLayout,
  type NodeLayout,
} from "./agent-graph-layout";

/**
 * The staged hover pulse. With no hover, every live ribbon's shimmer flows out
 * of the hub (a skill reaching all agents). While one agent is hovered it
 * "installs" that skill into the hub — its own shimmer runs inward (collect) —
 * and the hub then hands it on to everyone else — their shimmers run back out
 * (broadcast); the two phases alternate until the pointer leaves.
 *
 * The hover passes run a touch faster than the idle flow so the pulse reads,
 * and each is a single pass that fades in and out — the slider always
 * completes and never starts a second round it cannot finish.
 */
const SHIMMER_MS = 2600;
const SHIMMER_SECONDS = SHIMMER_MS / 1000;
/** Hover passes run a touch faster than the unhurried idle flow. */
export const HOVER_MS = 1100;
const HOVER_SECONDS = HOVER_MS / 1000;
/** The dash's travel, in path-normalised units (see `pathLength`). */
const SHIMMER_TRAVEL = 1;
/**
 * One shimmer dash per ribbon. Its dash-plus-gap run (1.01) is a hair longer
 * than the path (normalised to 1 by `pathLength`), so a single slider never
 * splits into two at the seam as it wraps.
 */
const SHIMMER_DASHARRAY = "0.08 0.93";

type Pulse = "idle" | "collect" | "broadcast";

/** How one ribbon's shimmer behaves in the current phase. */
interface ShimmerFlow {
  visible: boolean;
  inward: boolean;
  repeat: number;
  /** How long one pass along the ribbon takes. */
  seconds: number;
  /** Opacity target — a scalar, or keyframes when the pass fades in and out. */
  opacity: number | number[];
  /** Keyframe timing, present only when `opacity` is a keyframe array. */
  times?: number[];
}

/**
 * The agents graph: a live rendition of the brand mark — every detected agent
 * is a card in a column beside the SkillOne hub, balanced across its left and
 * right and packing outward so a long roster stays on one screen, and a ribbon
 * draws from each card into the hub. The ribbon's look is the agent's link
 * state:
 * a linked agent's brand-hued ribbon carries a shimmer whose direction tells
 * the story (out of the hub by default, and, on hover, one agent's into the hub
 * then everyone's back out — see `Pulse`), while unlinked agents stay as quiet
 * static lines — amber dashes when the agent's own directory already holds
 * content a link would adopt, gray dots otherwise; neither animates. Clicking a
 * card links or unlinks that agent outright.
 *
 * Geometry comes from the pure `layoutAgents` — one layout renders both the
 * SVG (ribbons, hub) and the absolutely-positioned cards above it — so this
 * file is animation and presentation only.
 */
export function AgentGraph({ agents }: { agents: AgentStatus[] }) {
  const [ref, size] = useElementSize();
  const [active, setActive] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Pulse>("idle");
  const { toggle, busyFor } = useAgentLinkToggle();

  // While an agent is hovered, alternate collect (that agent's shimmer into the
  // hub) and broadcast (everyone else's shimmer back out) on a loop; on leave,
  // settle to the plain outward flow.
  useEffect(() => {
    if (active === null) {
      setPulse("idle");
      return;
    }
    let timer = 0;
    let phase: Pulse = "collect";
    setPulse(phase);
    const advance = () => {
      timer = window.setTimeout(
        () => {
          phase = phase === "collect" ? "broadcast" : "collect";
          setPulse(phase);
          advance();
        },
        HOVER_MS,
      );
    };
    advance();
    return () => window.clearTimeout(timer);
  }, [active]);
  // The canvas never renders narrower than the card-column/hub clearance;
  // below the window width the outer scroller carries the overflow. Its height
  // is measured too, so the columns can be sized to keep the whole roster on one
  // screen instead of a single column scrolling off the bottom.
  const graphWidth = resolveGraphWidth(size.width);
  const layout = useMemo(
    () => layoutAgents(agents, graphWidth, size.height),
    [agents, graphWidth, size.height],
  );

  return (
    <div ref={ref} className="h-full w-full overflow-x-auto" data-pulse={pulse}>
      <div className="relative" style={{ width: layout.width }}>
        <svg
          width={layout.width}
          height={layout.height}
          className="block"
          aria-hidden="true"
        >
          {agents.map((agent, i) => (
            <Ribbon
              key={agent.name}
              agent={agent}
              d={layout.ribbons[i].d}
              index={i}
              pulse={pulse}
              lifted={active === agent.name}
            />
          ))}
          <Hub hub={layout.hub} pulse={pulse} />
        </svg>

        {/* The cards float above the ribbons; the wrapper itself lets pointer
            events through to anything not covered by a card. */}
        <div className="pointer-events-none absolute inset-0">
          {agents.map((agent, i) => (
            <AgentNode
              key={agent.name}
              agent={agent}
              node={layout.nodes[i]}
              index={i}
              busy={busyFor(agent.name)}
              onHover={setActive}
              onToggleLink={(link) =>
                toggle.mutate({ name: agent.name, link })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One agent-to-hub ribbon.
 *
 * Linked ribbons are three motion layers — a wide soft glow, the solid core
 * that draws itself in from nothing on mount, and one shimmer whose direction
 * is the link's whole story: with no hover every live ribbon flows out of the
 * hub; while an agent is hovered its shimmer runs into the hub (collect) and
 * the rest run back out (broadcast), alternating on the shared `pulse`.
 * Everything unlinked is deliberately static: one plain dashed/dotted line with
 * no self-running animation at all.
 */
function Ribbon({
  agent,
  d,
  index,
  pulse,
  lifted,
}: {
  agent: AgentStatus;
  d: string;
  index: number;
  pulse: Pulse;
  lifted: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const state = agentLinkState(agent);
  const color = ribbonColor(agent.name);

  if (state !== "linked") {
    return (
      <g data-agent={agent.name} data-state={state} data-animated="false">
        <path
          d={d}
          fill="none"
          className={
            state === "warning"
              ? "stroke-amber-500/55"
              : "stroke-muted-foreground/35"
          }
          strokeLinecap="round"
          strokeDasharray={state === "warning" ? "7 8" : "1 9"}
          strokeWidth={state === "warning" ? 3 : 2.5}
        />
      </g>
    );
  }

  // This ribbon's shimmer for the current phase: with no hover everyone flows
  // out (looping); on hover the agent under the pointer flows in (collect) and,
  // once it has landed, the others flow back out (broadcast). Each hover pass
  // is a single run that fades in and out, so it always completes, never starts
  // a second round, and never blinks out mid-flight. A ribbon that is neither
  // the collector nor part of the broadcast is not drawn at all — its animation
  // is cancelled outright, never left gliding on.
  const shimmer: ShimmerFlow =
    pulse === "idle"
      ? {
          visible: true,
          inward: false,
          repeat: Infinity,
          seconds: SHIMMER_SECONDS,
          opacity: 0.5,
        }
      : pulse === "collect"
        ? lifted
          ? {
              visible: true,
              inward: true,
              repeat: 0,
              seconds: HOVER_SECONDS,
              opacity: [0, 0.9, 0.9, 0],
              times: [0, 0.12, 0.88, 1],
            }
          : {
              visible: false,
              inward: false,
              repeat: 0,
              seconds: HOVER_SECONDS,
              opacity: 0,
            }
        : lifted
          ? {
              visible: false,
              inward: false,
              repeat: 0,
              seconds: HOVER_SECONDS,
              opacity: 0,
            }
          : {
              visible: true,
              inward: false,
              repeat: 0,
              seconds: HOVER_SECONDS,
              opacity: [0, 0.6, 0.6, 0],
              times: [0, 0.12, 0.88, 1],
            };

  return (
    <g
      data-agent={agent.name}
      data-state={state}
      data-animated="true"
      data-flow={lifted ? "in" : "out"}
    >
      {/* Soft glow underlay */}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={15}
        strokeLinecap="round"
        initial={reduceMotion ? undefined : { opacity: 0 }}
        animate={{
          opacity: lifted ? 0.32 : 0.16,
          strokeWidth: lifted ? 22 : 15,
        }}
        transition={{ duration: 0.25, delay: reduceMotion ? 0 : 0.55 }}
      />
      {/* The core ribbon, drawn in on mount */}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        initial={reduceMotion ? undefined : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1, strokeWidth: lifted ? 6.5 : 4 }}
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : {
                pathLength: {
                  delay: 0.15 + index * 0.07,
                  duration: 0.6,
                  ease: "easeOut",
                },
                opacity: { delay: 0.15 + index * 0.07, duration: 0.1 },
                strokeWidth: { duration: 0.2 },
              }
        }
      />
      {/* One shimmer, its direction and presence set by the current phase. It is
          keyed and mounted only while it has a flow, so switching phase cancels
          the old run outright instead of leaving a second slider gliding on. */}
      {!reduceMotion && shimmer.visible && (
        <motion.path
          key={shimmer.inward ? "in" : "out"}
          d={d}
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeWidth={2}
          pathLength={1}
          strokeDasharray={SHIMMER_DASHARRAY}
          initial={{ opacity: 0 }}
          animate={{
            strokeDashoffset: shimmer.inward
              ? [0, -SHIMMER_TRAVEL]
              : [0, SHIMMER_TRAVEL],
            opacity: shimmer.opacity,
          }}
          transition={{
            opacity: shimmer.times
              ? { duration: shimmer.seconds, times: shimmer.times }
              : {
                  duration: 0.2,
                  delay: pulse === "idle" ? 0.6 + index * 0.07 : 0,
                },
            strokeDashoffset: {
              duration: shimmer.seconds,
              repeat: shimmer.repeat,
              ease: "linear",
            },
          }}
        />
      )}
    </g>
  );
}

/**
 * The hub's two expanding signal rings, hoisted to module constants: the very
 * same target objects are handed back on every render, because a freshly built
 * keyframe array makes Motion restart the loop — which showed up as one ring
 * flashing out of step with the other, bright and full-size. The ring is
 * transparent at both ends of its run, so even a restart can never light a ring
 * at full size.
 */
const HUB_RING_RADIUS = [HUB_RADIUS, HUB_RADIUS + 4, HUB_RADIUS + 30];
const HUB_RING_OPACITY = [0, 0.4, 0];
const HUB_RING_TRANSITIONS = [0, 1].map((ring) => ({
  duration: 2.4,
  repeat: Infinity,
  delay: 0.6 + ring * 1.2,
  ease: "easeOut" as const,
  times: [0, 0.12, 1],
}));

/**
 * The hub: the brand-blue circle with the favicon's white double-square mark,
 * given a soft scale-in and two slowly expanding signal rings. The rings stand
 * down whenever an agent is hovered — the ribbons take over the radiating then
 * — and everything motion-driven stands down under the reduced-motion
 * preference.
 */
function Hub({ hub, pulse }: { hub: GraphLayout["hub"]; pulse: Pulse }) {
  const reduceMotion = useReducedMotion();
  return (
    <g>
      {/* The rings fade with the hover: while the graph is showing the
          install-and-share pulse, the hub's ambient ripple would only compete
          with it. */}
      <motion.g
        animate={{ opacity: pulse === "idle" ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {!reduceMotion &&
          HUB_RING_TRANSITIONS.map((transition, ring) => (
            <motion.circle
              key={ring}
              cx={hub.x}
              cy={hub.y}
              r={HUB_RADIUS}
              fill="none"
              strokeWidth={1.5}
              className="stroke-primary/40"
              initial={{ opacity: 0, r: HUB_RADIUS }}
              animate={{ r: HUB_RING_RADIUS, opacity: HUB_RING_OPACITY }}
              transition={transition}
            />
          ))}
      </motion.g>
      <motion.g
        data-testid="agent-hub"
        initial={reduceMotion ? undefined : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : { type: "spring", stiffness: 240, damping: 20, delay: 0.1 }
        }
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {/* The brand mark's convergence point: a near-black core, kept on the
            dark surface by a hairline ring. The two white rounded squares are
            the favicon glyph, so the core still names SkillOne itself. */}
        <circle
          cx={hub.x}
          cy={hub.y}
          r={HUB_RADIUS}
          fill="#18181b"
          strokeWidth={1}
          className="stroke-foreground/20"
        />
        {/* The favicon's two overlapping rounded squares, centred. */}
        <g fill="#ffffff">
          <rect x={hub.x - 15} y={hub.y - 15} width={19} height={19} rx={5} />
          <rect x={hub.x - 2} y={hub.y - 2} width={17} height={17} rx={5} />
        </g>
      </motion.g>
    </g>
  );
}

/**
 * One agent's card: its brand face and name. The link state is not spelled out
 * in words — the ribbon carries it — but the card echoes it without text: a
 * linked agent stays plain, while one linked to nothing reads as switched off,
 * its face greyed and its name dimmed, with a dashed edge — or an amber one when
 * its own directory already holds content a link would adopt. The card is a
 * button: clicking it links or unlinks this one agent outright (a canonical
 * agent's native directory cannot be switched off, so its card is inert), and
 * hovering it lifts the agent's own ribbon.
 */
function AgentNode({
  agent,
  node,
  index,
  busy,
  onHover,
  onToggleLink,
}: {
  agent: AgentStatus;
  node: NodeLayout;
  index: number;
  busy: boolean;
  onHover: (name: string | null) => void;
  onToggleLink: (link: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const state = agentLinkState(agent);
  const linked = state === "linked";
  const pinned = agent.canonical;

  return (
    <motion.div
      className="absolute"
      style={{ left: node.x, top: node.y, width: node.width }}
      initial={
        reduceMotion ? undefined : { opacity: 0, x: node.side === "left" ? -12 : 12 }
      }
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : { delay: 0.2 + index * 0.06, type: "spring", stiffness: 300, damping: 28 }
      }
    >
      <button
        type="button"
        onMouseEnter={() => onHover(agent.name)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onToggleLink(!linked)}
        disabled={pinned || busy}
        aria-label={agent.display}
        aria-pressed={linked}
        data-link-state={state}
        className={cn(
          "pointer-events-auto flex w-full cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 text-left",
          "outline-none transition-colors hover:bg-accent/40 disabled:cursor-default",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          state === "warning"
            ? "border-amber-500/40 hover:border-amber-500/60"
            : state === "unlinked"
              ? "border-dashed border-border hover:border-primary/30"
              : "border-border hover:border-primary/30",
        )}
        style={{ height: NODE_HEIGHT }}
      >
        <AgentIcon
          agentName={agent.name}
          size="sm"
          className={cn(!linked && "opacity-50 grayscale")}
        />
        <div
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] font-medium",
            !linked && "text-muted-foreground",
          )}
        >
          {agent.display}
        </div>
        {busy && (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </button>
    </motion.div>
  );
}

/** Observe an element's content-box size; 0 until the first measurement. */
function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      // An unchanged size must not re-render, or the observer re-arms forever.
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
