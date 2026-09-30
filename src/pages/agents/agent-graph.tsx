import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AgentStatus, InstalledSkill } from "../../lib/skills-manager";
import { agentLinkState } from "../../lib/agent-link-state";
import { useAgentLinkToggle } from "../../hooks/use-agent-link-toggle";
import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { AgentIcon } from "../../components/agent-icon";
import { cn } from "../../lib/utils";
import { useAgentEdgeColor } from "../../hooks/use-agent-edge-color";
import { JAR_CAPACITY, HubJar } from "./hub-jar";
import {
  layoutAgents,
  resolveGraphWidth,
  HUB_CARD_HALF,
  HUB_CARD_HALF_COLUMNS,
  type AgentsLayoutMode,
  type GraphLayout,
  type NodeLayout,
} from "./agent-graph-layout";

/**
 * Entrance stagger for one node: in columns mode a whole column lands at
 * once and columns cascade outer-to-inner (ending at the hub); the
 * constellation keeps the per-agent ripple. Callers add their own base
 * (nodes 0.15s, ribbons 0.1s) on top.
 */
function enterStagger(col: number | undefined, index: number): number {
  if (col !== undefined) return col * 0.12;
  return index * 0.05;
}

/**
 * The staged hover pulse. With no hover every ribbon is fully still. While
 * one agent is hovered its shimmer first runs inward into the hub (collect —
 * that agent "installs" its skill), and the hub then hands it back out to
 * everyone else (broadcast — their shimmers run outward); the two phases
 * alternate until the pointer leaves.
 *
 * Each hover pass is a single run a touch faster than an idle glance, and it
 * fades in and out, so the slider always completes and never starts a second
 * round it cannot finish.
 */
export const HOVER_MS = 750;
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
  /** How many times the pass repeats — one for hover phases, never looping. */
  repeat: number;
  /** How long one pass along the ribbon takes. */
  seconds: number;
  /** Opacity target — a scalar, or keyframes when the pass fades in and out. */
  opacity: number | number[];
  /** Keyframe timing, present only when `opacity` is a keyframe array. */
  times?: number[];
}

/**
 * The agents graph: every detected agent is one bare icon on a Vogel spiral
 * around the SkillOne hub — casually scattered to every side, evenly spaced
 * and never overlapping, shrinking to fit a long roster. A thin ribbon draws
 * from each icon into the hub with one shared swirl, and its look is the
 * agent's link state alone — a quiet static line: a hub-gray to icon-color
 * gradient for linked agents, amber dashes when the agent's own directory
 * already holds content a link would adopt, gray dots when unlinked. Nothing self-animates; only
 * hovering an agent wakes the pulse — its own shimmer first flows into the
 * hub (collect), then the hub hands the skill back out to every other linked
 * agent (broadcast), alternating until the pointer leaves. The pill says the
 * name outright beside its face; the face and edge alone carry the state,
 * and a click links or unlinks it outright.
 *
 * Geometry comes from the pure `layoutAgents` — one layout renders both the
 * SVG ribbons and the absolutely-positioned HTML above it — so this file is
 * presentation only.
 */
export function AgentGraph({
  agents,
  mode = "columns",
}: {
  agents: AgentStatus[];
  mode?: AgentsLayoutMode;
}) {
  const [ref, size] = useElementSize();
  const [active, setActive] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Pulse>("idle");
  const { toggle, busyFor } = useAgentLinkToggle();
  const { data: skills, isLoading: skillsLoading } = useInstalledSkills();

  // While an agent is hovered, alternate collect (its shimmer into the hub)
  // and broadcast (everyone else's shimmer back out) on a loop; on leave the
  // whole graph settles to full stillness.
  useEffect(() => {
    if (active === null) {
      setPulse("idle");
      return;
    }
    let timer = 0;
    let phase: Pulse = "collect";
    setPulse(phase);
    const advance = () => {
      timer = window.setTimeout(() => {
        phase = phase === "collect" ? "broadcast" : "collect";
        setPulse(phase);
        advance();
      }, HOVER_MS);
    };
    advance();
    return () => window.clearTimeout(timer);
  }, [active]);

  // The canvas is always exactly the measured box — it never grows, so there
  // is no scroller. The window's minimum size keeps the roster on one screen.
  const graphWidth = resolveGraphWidth(size.width);
  const layout = useMemo(
    () => layoutAgents(agents, graphWidth, size.height, mode),
    [agents, graphWidth, size.height, mode],
  );

  return (
    <div ref={ref} className="h-full w-full overflow-hidden" data-pulse={pulse}>
      {/* Keyed by presentation: flipping constellation/columns remounts the
          whole picture so the entrance cascade replays instead of hard-cutting
          every node to its new spot. */}
      <div key={mode} className="relative" style={{ width: layout.width }}>
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
              from={layout.nodes[i].anchor}
              hub={layout.hub}
              index={i}
              col={layout.nodes[i].col}
              pulse={pulse}
              lifted={active === agent.name}
            />
          ))}
        </svg>

        {/* The icons and hub float above the ribbons; the wrapper itself lets
            pointer events through to anything not covered by a control. */}
        <div className="pointer-events-none absolute inset-0">
          {agents.map((agent, i) => (
            <AgentNode
              key={agent.name}
              agent={agent}
              node={layout.nodes[i]}
              index={i}
              busy={busyFor(agent.name)}
              onHover={setActive}
              onToggleLink={(link) => toggle.mutate({ name: agent.name, link })}
            />
          ))}
          <HubDisk
            hub={layout.hub}
            agents={agents}
            skills={skills ?? []}
            loading={skillsLoading && !skills}
            mode={mode}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One agent-to-hub ribbon.
 *
 * Unlinked states are one plain static path, never animated and never lifted
 * — amber dashes for content a link would adopt, gray dots otherwise. A
 * linked ribbon is one thin gradient line that draws itself in on mount and
 * otherwise stays still: faint neutral at the hub, warming to the average
 * color of the agent's own icon at its tile (neutral all the way while the
 * icon is still loading or has no usable color). Only while an agent is
 * hovered does the staged pulse move a shimmer — into the hub from the
 * hovered agent (collect), then back out of the hub to every other linked
 * agent (broadcast). There is deliberately no glow layer: the picture stays
 * quiet, the icons own the attention.
 */
function Ribbon({
  agent,
  d,
  from,
  hub,
  index,
  col,
  pulse,
  lifted,
}: {
  agent: AgentStatus;
  d: string;
  from: { x: number; y: number };
  hub: { x: number; y: number };
  index: number;
  /** Columns-mode column index: the ribbon draws with its column's cascade. */
  col?: number;
  pulse: Pulse;
  lifted: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const state = agentLinkState(agent);
  const edgeColor = useAgentEdgeColor(agent.name);
  const gradientId = `edge-${agent.name.replace(/[^a-z0-9-]/gi, "-")}`;

  if (state !== "linked") {
    // A link that is not there stays quiet always — hovering its icon neither
    // brightens nor moves its line. Only linked ribbons answer a hover.
    return (
      <g data-agent={agent.name} data-state={state} data-lifted="false">
        <path
          d={d}
          fill="none"
          className={
            state === "warning"
              ? "stroke-amber-500/60"
              : "stroke-muted-foreground/40"
          }
          strokeLinecap="round"
          strokeDasharray={state === "warning" ? "6 8" : "1 9"}
          strokeWidth={state === "warning" ? 2.5 : 2}
        />
      </g>
    );
  }

  // This ribbon's shimmer for the current pulse phase. Idle: nothing flows at
  // all. Collect: the hovered ribbon flows inward once, the rest are silent.
  // Broadcast: the hovered ribbon goes quiet and every other linked ribbon
  // flows outward once. A ribbon that is neither the collector nor part of
  // the broadcast mounts no shimmer, so switching phase cancels the old run
  // outright instead of leaving a second slider gliding on.
  const shimmer: ShimmerFlow =
    pulse === "idle"
      ? {
          visible: false,
          inward: false,
          repeat: 0,
          seconds: HOVER_SECONDS,
          opacity: 0,
        }
      : pulse === "collect"
        ? lifted
          ? {
              visible: true,
              inward: true,
              repeat: 0,
              seconds: HOVER_SECONDS,
              opacity: [0, 0.5, 0.5, 0],
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
              opacity: [0, 0.35, 0.35, 0],
              times: [0, 0.12, 0.88, 1],
            };

  return (
    <g
      data-agent={agent.name}
      data-state={state}
      data-lifted={lifted ? "true" : "false"}
      data-flow={lifted ? "in" : "out"}
    >
      {/* The one quiet core line; it brightens and thickens on hover. When
          the icon's average color has resolved the stroke is a hub-to-tile
          gradient — faint neutral at the hub, its own color at the tile;
          otherwise one flat neutral line. */}
      <defs>
        {edgeColor && (
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={hub.x}
            y1={hub.y}
            x2={from.x}
            y2={from.y}
          >
            <stop offset="0" stopColor="#8a8f98" stopOpacity={0.08} />
            <stop offset="0.55" stopColor="#8a8f98" stopOpacity={0.18} />
            <stop offset="1" stopColor={edgeColor} stopOpacity={0.8} />
          </linearGradient>
        )}
      </defs>
      <motion.path
        d={d}
        fill="none"
        stroke={edgeColor ? `url(#${gradientId})` : undefined}
        className={edgeColor ? undefined : "stroke-muted-foreground/30"}
        strokeLinecap="round"
        strokeWidth={1.5}
        initial={reduceMotion ? undefined : { pathLength: 0, strokeWidth: 1.5 }}
        animate={{
          pathLength: 1,
          opacity: lifted ? 0.9 : 0.6,
          strokeWidth: lifted ? 2.5 : 1.5,
        }}
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : {
                pathLength: {
                  delay: 0.1 + enterStagger(col, index),
                  duration: 0.5,
                  ease: "easeOut",
                },
                opacity: { duration: 0.2 },
                strokeWidth: { duration: 0.2 },
              }
        }
      />
      {/* One shimmer, keyed by its direction and mounted only while it has a
          flow, so a phase switch cancels the old run outright. Negative
          offset travels toward the hub (collect), positive away (broadcast). */}
      {!reduceMotion && shimmer.visible && (
        <motion.path
          key={shimmer.inward ? "in" : "out"}
          d={d}
          fill="none"
          className="stroke-foreground/50"
          strokeLinecap="round"
          strokeWidth={1.5}
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
              : { duration: 0.2 },
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
 * The hub: the container card pinned at the constellation's centre. The
 * geometry (hub.x/y) is unchanged so ribbons still converge underneath it —
 * the card is opaque and covers their tips.
 *
 * The hub is one abstract **jar** holding the enabled skills as tiny title
 * cards, poured in by real physics (see `HubJar` — a matter-js run with
 * seeded spawns, settling against the jar's floor and walls, then holding
 * still). It is sized to hold fifty cards — a full roster, not a preview.
 * With nothing enabled the jar holds every installed skill instead, so it
 * never reads as broken on a fresh install; with nothing installed it says
 * so. There is no card chrome around it and no prose on it: the one figure
 * it states — how many skills it holds — sits **in the border line itself**,
 * the way a fieldset's legend interrupts its own frame, and a roster past
 * the jar's capacity states the remainder as a quiet `+n` chip riding the
 * rim. The attention count rides the opposite corner when something needs
 * it.
 */
function HubDisk({
  hub,
  agents,
  skills,
  loading,
  mode,
}: {
  hub: GraphLayout["hub"];
  agents: AgentStatus[];
  skills: InstalledSkill[];
  loading: boolean;
  mode: AgentsLayoutMode;
}) {
  const { t } = useTranslation();
  const total = skills.length;
  const enabled = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  );
  const attentionCount = agents.filter(
    (agent) => agentLinkState(agent) === "warning",
  ).length;
  // The jar's contents: the enabled skills, falling back to every installed
  // one when nothing is enabled (a fresh install is an empty report, not an
  // empty jar), up to the jar's own capacity — the physics jar is sized to
  // hold exactly this many. Past the capacity the jar stays whole and the
  // remainder is stated, never silently dropped.
  const poured = enabled.length > 0 ? enabled : skills;
  const jarred = poured.slice(0, JAR_CAPACITY);
  const overflow = poured.length - jarred.length;
  // The columns presentation keeps a narrower central lane, so the card
  // renders slimmer there; widths stay in sync with the layout clearance
  // constants.
  const width =
    mode === "columns" ? HUB_CARD_HALF_COLUMNS * 2 : HUB_CARD_HALF * 2;

  return (
    <div
      className="pointer-events-auto absolute"
      style={{
        left: hub.x,
        top: hub.y,
        width,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        data-testid="agent-hub"
        aria-label={t("agents.hub.diskAria", { total, enabled: enabled.length })}
        className="relative"
      >
        {/* The legend sits in the jar's own border line — a fieldset's
            legend, not a caption above it: the one figure the jar states,
            read as part of the frame rather than as prose on the page. */}
        <span className="absolute left-3 top-0 z-10 -translate-y-1/2 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {t("agents.hub.installed", { total })}
        </span>

        {/* The jar: a field the cards rain into and settle at the bottom of.
            It clips at the rim, so an over-capacity roster reads as a jar
            filled to the neck, with the remainder stated by the `+n` chip on
            the opposite corner from the attention chip. */}
        {loading ? (
          <div className="flex h-[190px] items-center justify-center rounded-xl border border-border/60 bg-muted/50">
            <Loader2
              className="size-5 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        ) : (
          <div className="relative h-[190px] overflow-hidden rounded-xl border border-border/60 bg-muted/50">
            {jarred.length === 0 ? (
              <p className="flex h-full items-center justify-center px-2 text-[11px] text-muted-foreground">
                {t("agents.hub.noneEnabled")}
              </p>
            ) : (
              <HubJar skills={jarred} className="h-full w-full" />
            )}
            {overflow > 0 && (
              <p
                title={t("agents.hub.overflowAria", { count: overflow })}
                className="absolute left-2 top-2 rounded-full bg-background/80 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              >
                +{overflow}
              </p>
            )}
            {attentionCount > 0 && (
              <p className="absolute right-2 top-2 rounded-full bg-background/80 px-1.5 text-[10px] font-medium text-amber-600 tabular-nums dark:text-amber-500">
                {t("agents.attention", { count: attentionCount })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One agent's node: a pill carrying its brand face and its name. The link
 * state is carried by the ribbon and echoed without words on the pill's edge
 * (dashed when unlinked, amber when its own directory holds content) and on
 * the face itself (greyed out when switched off). The pill is the switch:
 * clicking it links or unlinks outright (a canonical agent's native directory
 * cannot be switched off, so its pill is inert). Longer names truncate inside
 * the fixed label slot the layout reserves.
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
      // Hover lives on the wrapper, not the button: a canonical icon is a
      // disabled button, which some webviews (WKWebView) send no pointer
      // events to — its ribbon must still lift on hover.
      onMouseEnter={() => onHover(agent.name)}
      onMouseLeave={() => onHover(null)}
      // Entrance drift: outward along the spiral ray, or sideways in columns.
      // Columns cascade a column at a time (see `enterStagger`); the
      // constellation ripples agent by agent.
      initial={
        reduceMotion
          ? undefined
          : node.side
            ? { opacity: 0, x: node.side === "left" ? -10 : 10 }
            : {
                opacity: 0,
                x: Math.cos(node.angle ?? 0) * 10,
                y: Math.sin(node.angle ?? 0) * 10,
              }
      }
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : {
              delay: 0.15 + enterStagger(node.col, index),
              type: "spring",
              stiffness: 300,
              damping: 28,
            }
      }
    >
      <button
        type="button"
        onClick={() => onToggleLink(!linked)}
        disabled={pinned || busy}
        aria-label={agent.display}
        aria-pressed={linked}
        data-link-state={state}
        onFocus={() => onHover(agent.name)}
        onBlur={() => onHover(null)}
        className={cn(
          "pointer-events-auto relative flex w-full cursor-pointer items-center gap-2 rounded-lg border bg-card pr-3 pl-1.5 outline-none transition-colors",
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-default",
          state === "warning"
            ? "border-amber-500/50 hover:border-amber-500/70"
            : state === "unlinked"
              ? "border-dashed border-border hover:border-primary/40"
              : "border-border hover:border-primary/40",
        )}
        style={{ height: node.height }}
      >
        {/* The macOS-app-style icon box; the glyph fills it (the brand SVGs
            already carry their own small safe margin inside the viewBox). */}
        <span
          className="shrink-0"
          style={{ width: node.height - 12, height: node.height - 12 }}
        >
          <AgentIcon
            agentName={agent.name}
            shape="squircle"
            className={cn(!linked && "opacity-50 grayscale")}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium">
          {agent.display}
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-card/70">
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </span>
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
