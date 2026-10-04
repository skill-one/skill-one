import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2 } from "lucide-react";

import type { AgentStatus } from "../../lib/skills-manager";
import { agentLinkState } from "../../lib/agent-link-state";
import { useAgentLinkToggle } from "../../hooks/use-agent-link-toggle";
import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { AgentIcon } from "../../components/agent-icon";
import { cn } from "../../lib/utils";
import { useAgentEdgeColor } from "../../hooks/use-agent-edge-color";
import { HubDashboard } from "./hub-dashboard";
import {
  layoutAgents,
  resolveGraphWidth,
  HUB_CARD_HALF_COLUMNS,
  type NodeLayout,
} from "./agent-graph-layout";

/**
 * Entrance stagger for one node: a whole column lands at once and
 * columns cascade outer-to-inner (ending at the hub). Callers add
 * their own base (nodes 0.15s, ribbons 0.1s) on top.
 */
function enterStagger(col: number | undefined, index: number): number {
  if (col !== undefined) return col * 0.12;
  return index * 0.05;
}

export const HOVER_MS = 750;
const HOVER_SECONDS = HOVER_MS / 1000;
const SHIMMER_TRAVEL = 1;
const SHIMMER_DASHARRAY = "0.08 0.93";

type Pulse = "idle" | "collect" | "broadcast";

interface ShimmerFlow {
  visible: boolean;
  inward: boolean;
  repeat: number;
  seconds: number;
  opacity: number | number[];
  times?: number[];
}

/**
 * The agents graph: detected agents distributed symmetrically in dual columns
 * around the SkillOne hub card with dedicated switch controls and inspection dialogs.
 */
export function AgentGraph({ agents }: { agents: AgentStatus[] }) {
  const [ref, size] = useElementSize();
  const [active, setActive] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Pulse>("idle");

  const { toggle, busyFor } = useAgentLinkToggle();
  const { data: skills, isLoading: skillsLoading } = useInstalledSkills();

  // Hover pulse alternation: collect -> broadcast
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

  const graphWidth = resolveGraphWidth(size.width);
  const layout = useMemo(
    () => layoutAgents(agents, graphWidth, size.height),
    [agents, graphWidth, size.height],
  );

  const hubWidth = HUB_CARD_HALF_COLUMNS * 2;

  return (
    <div ref={ref} className="h-full w-full overflow-hidden" data-pulse={pulse}>
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
              from={layout.nodes[i].anchor}
              hub={layout.hub}
              index={i}
              col={layout.nodes[i].col}
              pulse={pulse}
              lifted={active === agent.name}
            />
          ))}
        </svg>

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

          {/* Central Hub Dashboard */}
          <div
            className="pointer-events-auto absolute"
            style={{
              left: layout.hub.x,
              top: layout.hub.y,
              transform: "translate(-50%, -50%)",
            }}
          >
            <HubDashboard
              agents={agents}
              skills={skills ?? []}
              loading={skillsLoading && !skills}
              width={hubWidth}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One agent-to-hub ribbon.
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
  col?: number;
  pulse: Pulse;
  lifted: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const state = agentLinkState(agent);
  const edgeColor = useAgentEdgeColor(agent.name);
  const gradientId = `edge-${agent.name.replace(/[^a-z0-9-]/gi, "-")}`;

  if (state !== "linked") {
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
 * Agent node pill: displays brand icon and name.
 * Clicking directly toggles link/unlink.
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
      onMouseEnter={() => onHover(agent.name)}
      onMouseLeave={() => onHover(null)}
      initial={
        reduceMotion
          ? undefined
          : { opacity: 0, x: node.side === "left" ? -10 : 10 }
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
          "pointer-events-auto relative flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 outline-none transition-all shadow-2xs select-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-default",
          state === "warning"
            ? "border-amber-500/50 bg-amber-500/10 hover:border-amber-500/70 hover:bg-amber-500/15"
            : state === "unlinked"
              ? "border-dashed border-border/70 bg-card/30 opacity-60 hover:opacity-100 hover:border-primary/50 hover:bg-accent/40"
              : "border-border/80 bg-card hover:border-primary/60 hover:bg-accent/50",
        )}
        style={{ height: node.height }}
      >
        <span
          className="shrink-0"
          style={{ width: node.height - 12, height: node.height - 12 }}
        >
          <AgentIcon
            agentName={agent.name}
            shape="squircle"
            className={cn(!linked && "opacity-45 grayscale")}
          />
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left text-[12px] transition-colors",
            linked
              ? "font-medium text-foreground"
              : "font-normal text-muted-foreground",
          )}
        >
          {agent.display}
        </span>

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-card/80">
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

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
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
