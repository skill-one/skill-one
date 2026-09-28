import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { Loader2, SlidersHorizontal, Store } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AgentStatus, InstalledSkill } from "../../lib/skills-manager";
import { agentLinkState } from "../../lib/agent-link-state";
import { useAgentLinkToggle } from "../../hooks/use-agent-link-toggle";
import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { AgentIcon } from "../../components/agent-icon";
import { buttonVariants } from "../../components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import {
  layoutAgents,
  resolveGraphWidth,
  ribbonColor,
  type GraphLayout,
  type NodeLayout,
} from "./agent-graph-layout";

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
 * agent's link state alone — a quiet static line: a brand hue for linked
 * agents, amber dashes when the agent's own directory already holds content a
 * link would adopt, gray dots when unlinked. Nothing self-animates; only
 * hovering an agent wakes the pulse — its own shimmer first flows into the
 * hub (collect), then the hub hands the skill back out to every other linked
 * agent (broadcast), alternating until the pointer leaves. The icon says
 * nothing in words: its edge and face carry the state, a small tooltip on
 * the side away from the hub carries just its name, and a click links or
 * unlinks it outright.
 *
 * Geometry comes from the pure `layoutAgents` — one layout renders both the
 * SVG ribbons and the absolutely-positioned HTML above it — so this file is
 * presentation only.
 */
export function AgentGraph({ agents }: { agents: AgentStatus[] }) {
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

  // The canvas never renders narrower than the icon-column/hub clearance;
  // below the window width the outer scroller carries the overflow. Its height
  // is measured too, so the columns can be sized to keep the whole roster on
  // one screen instead of a single column scrolling off the bottom.
  const graphWidth = resolveGraphWidth(size.width);
  const layout = useMemo(
    () => layoutAgents(agents, graphWidth, size.height),
    [agents, graphWidth, size.height],
  );

  return (
    <div ref={ref} className="h-full w-full overflow-auto" data-pulse={pulse}>
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
            skills={skills ?? []}
            loading={skillsLoading && !skills}
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
 * linked ribbon is one thin brand-hued line that draws itself in on mount and
 * otherwise stays still; only while an agent is hovered does the staged
 * pulse move a shimmer — into the hub from the hovered agent (collect), then
 * back out of the hub to every other linked agent (broadcast). There is
 * deliberately no glow layer: the picture stays quiet, the icons own the
 * attention.
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
      data-lifted={lifted ? "true" : "false"}
      data-flow={lifted ? "in" : "out"}
    >
      {/* The one quiet core line; it brightens and thickens on hover. */}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        initial={reduceMotion ? undefined : { pathLength: 0 }}
        animate={{
          pathLength: 1,
          opacity: lifted ? 1 : 0.7,
          strokeWidth: lifted ? 3.5 : 2,
        }}
        transition={
          reduceMotion
            ? { duration: 0.2 }
            : {
                pathLength: {
                  delay: 0.1 + index * 0.05,
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
 * The hub: a quiet card-surface disk at the constellation's centre showing
 * just the installed-skill count. Its hover card lists the enabled skills
 * (scrollable, so a hundred-plus names stay usable) and carries the two
 * routes — store and management — in its footer.
 */
function HubDisk({
  hub,
  skills,
  loading,
}: {
  hub: GraphLayout["hub"];
  skills: InstalledSkill[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const total = skills.length;
  const enabled = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  );

  return (
    <div
      className="pointer-events-auto absolute"
      style={{
        left: hub.x - hub.radius,
        top: hub.y - hub.radius,
        width: hub.radius * 2,
        height: hub.radius * 2,
      }}
    >
      <HoverCard>
        <HoverCardTrigger
          delay={150}
          closeDelay={150}
          render={
            <div
              data-testid="agent-hub"
              aria-label={t("agents.hub.diskAria", { total })}
              className="flex size-24 cursor-default items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:border-primary/40"
            >
              {loading ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-[30px] leading-none font-semibold text-foreground tabular-nums">
                  {total}
                </span>
              )}
            </div>
          }
        />
        <HoverCardContent
          side="top"
          sideOffset={8}
          className="w-72 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[12px] font-medium">
              {t("agents.hub.previewTitle")}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {enabled.length}/{total}
            </p>
          </div>
          {enabled.length > 0 ? (
            // Two compact columns, capped in height and scrolled: the list can
            // run past a hundred names without growing the card unbounded.
            <ul className="mt-2 grid max-h-56 grid-cols-2 gap-x-3 gap-y-0.5 overflow-y-auto pr-1">
              {enabled.map((skill) => (
                <li
                  key={skill.name}
                  className="truncate text-[12px] text-muted-foreground"
                  title={skill.name}
                >
                  {skill.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-muted-foreground">
              {t("agents.hub.noneEnabled")}
            </p>
          )}
          {/* The two routes live in the card's footer, below the list. */}
          <div className="mt-3 flex gap-2 border-t pt-2.5">
            <Link
              to="/explore"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "flex-1",
              })}
            >
              <Store />
              {t("agents.hub.browseStore")}
            </Link>
            <Link
              to="/my-skills"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "flex-1",
              })}
            >
              <SlidersHorizontal />
              {t("agents.hub.manage")}
            </Link>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

/**
 * One agent's node: its bare brand face. The link state is carried by the
 * ribbon and echoed without words on the icon's edge (dashed when unlinked,
 * amber when its own directory holds content) and on the face itself
 * (greyed out when switched off). The icon is the switch: clicking it links
 * or unlinks outright (a canonical agent's native directory cannot be
 * switched off, so its icon is inert). Hover adds one thing only — its name,
 * in a small tooltip on the side away from the hub, so the ribbon and its
 * shimmer stay fully visible.
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
      // Entrance drift comes from the node's outward direction on the spiral.
      initial={
        reduceMotion
          ? undefined
          : {
              opacity: 0,
              x: Math.cos(node.angle) * 10,
              y: Math.sin(node.angle) * 10,
            }
      }
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : {
              delay: 0.15 + index * 0.05,
              type: "spring",
              stiffness: 300,
              damping: 28,
            }
      }
    >
      <Tooltip>
        {/* The trigger wraps the button in a span: the canonical icon is a
            disabled button, which receives no pointer events itself in some
            webviews — the wrapper span is what the tooltip can always open
            from (Base UI's own disabled-button pattern). */}
        <TooltipTrigger render={<span className="flex w-full" />}>
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
              // A macOS-app-style tile: the rounded square is the icon
              // box and the glyph fills it (the brand SVGs already carry
              // their own small safe margin inside the viewBox).
              "pointer-events-auto relative flex w-full cursor-pointer items-center justify-center rounded-[22.5%] border bg-card p-0 outline-none transition-colors",
              "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-default",
              state === "warning"
                ? "border-amber-500/50 hover:border-amber-500/70"
                : state === "unlinked"
                  ? "border-dashed border-border hover:border-primary/40"
                  : "border-border hover:border-primary/40",
            )}
            style={{ height: node.height }}
          >
            <AgentIcon
              agentName={agent.name}
              shape="squircle"
              className={cn(!linked && "opacity-50 grayscale")}
            />
            {busy && (
              <span className="absolute inset-0 flex items-center justify-center rounded-[22.5%] bg-card/70">
                <Loader2
                  className="size-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
            )}
          </button>
        </TooltipTrigger>
        {/* Away from the hub — outward horizontally while the canvas edge
            holds it, otherwise above/below — so it never layers over the
            ribbon. */}
        <TooltipContent
          side={node.tipSide}
          sideOffset={8}
          align={
            node.tipSide === "top" || node.tipSide === "bottom"
              ? Math.cos(node.angle) >= 0
                ? "end"
                : "start"
              : "center"
          }
        >
          {agent.display}
        </TooltipContent>
      </Tooltip>
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
