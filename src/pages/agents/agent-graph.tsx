import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import type { AgentStatus } from "../../lib/skills-manager";
import {
  agentLinkState,
  agentStateDotClass,
  agentStateLabelKey,
} from "../../lib/agent-link-state";
import { useAgentLinkToggle } from "../../hooks/use-agent-link-toggle";
import { AgentIcon } from "../../components/agent-icon";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "../../components/ui/popover";
import { Switch } from "../../components/ui/switch";
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
 * The agents graph: a live rendition of the brand mark — every detected agent
 * is a card in a vertical column on the left, and a ribbon draws from it into
 * the SkillOne hub on the right. The ribbon's look is the agent's link state:
 * a linked agent's brand-hued ribbon carries a slow shimmer running into the
 * hub, while unlinked agents stay as quiet static lines — amber dashes when
 * the agent's own directory already holds content a link would adopt, gray
 * dots otherwise; neither animates. Clicking a card opens the per-agent link
 * switch.
 *
 * Geometry comes from the pure `layoutAgents` — one layout renders both the
 * SVG (ribbons, hub) and the absolutely-positioned cards above it — so this
 * file is animation and presentation only.
 */
export function AgentGraph({ agents }: { agents: AgentStatus[] }) {
  const [ref, width] = useElementWidth();
  const [active, setActive] = useState<string | null>(null);
  const { toggle, busyFor } = useAgentLinkToggle();
  // The canvas never renders narrower than the card-column/hub clearance;
  // below the window width the outer scroller carries the overflow.
  const graphWidth = resolveGraphWidth(width);
  const layout = useMemo(
    () => layoutAgents(agents, graphWidth),
    [agents, graphWidth],
  );

  return (
    <div ref={ref} className="w-full overflow-x-auto">
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
              dimmed={active !== null && active !== agent.name}
              lifted={active === agent.name}
            />
          ))}
          <Hub hub={layout.hub} />
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
              dimmed={active !== null && active !== agent.name}
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
 * that draws itself in from nothing on mount, and one shimmer travelling
 * toward the hub to say the link is live. Everything unlinked is deliberately
 * static: one plain dashed/dotted line, dimmed, with no self-running
 * animation (the only motion it ever takes is the instant hover dim of the
 * group it sits in).
 */
function Ribbon({
  agent,
  d,
  index,
  dimmed,
  lifted,
}: {
  agent: AgentStatus;
  d: string;
  index: number;
  dimmed: boolean;
  lifted: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const state = agentLinkState(agent);
  const color = ribbonColor(agent.name);

  if (state !== "linked") {
    return (
      <g
        data-agent={agent.name}
        data-state={state}
        data-animated="false"
        style={{
          opacity: dimmed ? 0.18 : 1,
          transition: "opacity 150ms ease",
        }}
      >
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

  return (
    <motion.g
      data-agent={agent.name}
      data-state={state}
      data-animated="true"
      animate={{ opacity: dimmed ? 0.2 : 1 }}
      transition={{ duration: 0.25 }}
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
      {/* One shimmer travelling toward the hub */}
      {!reduceMotion && (
        <motion.path
          d={d}
          fill="none"
          stroke="#ffffff"
          strokeLinecap="round"
          strokeWidth={2}
          pathLength={1}
          strokeDasharray="0.07 0.93"
          initial={{ opacity: 0 }}
          animate={{ strokeDashoffset: [0, -1], opacity: lifted ? 0.9 : 0.5 }}
          transition={{
            opacity: { duration: 0.3, delay: 0.6 + index * 0.07 },
            strokeDashoffset: {
              duration: 2.6,
              repeat: Infinity,
              ease: "linear",
            },
          }}
        />
      )}
    </motion.g>
  );
}

/**
 * The hub: the brand-blue circle with the favicon's white double-square mark,
 * given a soft scale-in and two slowly expanding signal rings. Everything
 * motion-driven stands down under the reduced-motion preference.
 */
function Hub({ hub }: { hub: GraphLayout["hub"] }) {
  const reduceMotion = useReducedMotion();
  return (
    <g>
      {!reduceMotion &&
        [0, 1].map((ring) => (
          <motion.circle
            key={ring}
            cx={hub.x}
            cy={hub.y}
            r={hub.radius}
            fill="none"
            strokeWidth={1.5}
            className="stroke-primary/40"
            initial={{ opacity: 0.4, r: hub.radius }}
            animate={{ r: [hub.radius, hub.radius + 28], opacity: [0.4, 0] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: 0.6 + ring * 1.2,
              ease: "easeOut",
            }}
          />
        ))}
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
 * One agent's card: brand face, name, and the link state line with any
 * pending adoption/quarantine counts. The card is a button: clicking it opens
 * the popover whose switch links or unlinks this one agent (the same action
 * the settings dialog runs). Hovering it lifts the agent's own ribbon and dims
 * the rest.
 */
function AgentNode({
  agent,
  node,
  index,
  busy,
  dimmed,
  onHover,
  onToggleLink,
}: {
  agent: AgentStatus;
  node: NodeLayout;
  index: number;
  busy: boolean;
  dimmed: boolean;
  onHover: (name: string | null) => void;
  onToggleLink: (link: boolean) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const state = agentLinkState(agent);
  const skillsCount = agent.internalSkills?.length ?? 0;
  const othersCount = agent.internalOthers?.length ?? 0;
  const pinned = agent.canonical;

  return (
    <motion.div
      className="absolute"
      style={{ left: node.x, top: node.y, width: node.width }}
      initial={reduceMotion ? undefined : { opacity: 0, x: -12 }}
      animate={{ opacity: dimmed ? 0.55 : 1, x: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : { delay: 0.2 + index * 0.06, type: "spring", stiffness: 300, damping: 28 }
      }
    >
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              onMouseEnter={() => onHover(agent.name)}
              onMouseLeave={() => onHover(null)}
              aria-label={agent.display}
              className={cn(
                "pointer-events-auto flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 text-left",
                "outline-none transition-colors hover:bg-accent/40",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "data-[popup-open]:border-primary/50 data-[popup-open]:bg-accent/40",
                state === "warning"
                  ? "border-amber-500/40"
                  : "border-border hover:border-primary/30",
              )}
              style={{ ["--node-height" as string]: `${NODE_HEIGHT}px`, height: NODE_HEIGHT }}
            />
          }
        >
          <AgentIcon agentName={agent.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">
              {agent.display}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  agentStateDotClass[state],
                )}
              />
              <span className="shrink-0">{t(agentStateLabelKey(agent))}</span>
              {skillsCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    {t("agents.nodeSkills", { count: skillsCount })}
                  </span>
                </>
              )}
              {othersCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    {t("agents.nodeFiles", { count: othersCount })}
                  </span>
                </>
              )}
            </div>
          </div>
          {busy && (
            <Loader2
              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </PopoverTrigger>

        <AgentNodePopover
          agent={agent}
          busy={busy}
          pinned={pinned}
          onToggleLink={onToggleLink}
        />
      </Popover>
    </motion.div>
  );
}

/**
 * The card's popover: the agent's state and the one switch that links or
 * unlinks it. Canonical agents use their native skills directory, so their
 * switch is pinned on and disabled exactly as in the settings dialog.
 */
function AgentNodePopover({
  agent,
  busy,
  pinned,
  onToggleLink,
}: {
  agent: AgentStatus;
  busy: boolean;
  pinned: boolean;
  onToggleLink: (link: boolean) => void;
}) {
  const { t } = useTranslation();
  const state = agentLinkState(agent);
  const skillsCount = agent.internalSkills?.length ?? 0;
  const othersCount = agent.internalOthers?.length ?? 0;

  return (
    <PopoverContent side="right" align="start" sideOffset={10} className="w-64">
      <div className="flex items-center gap-2.5">
        <AgentIcon agentName={agent.name} />
        <PopoverTitle className="truncate text-[13px]">
          {agent.display}
        </PopoverTitle>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            agentStateDotClass[state],
          )}
        />
        <span>{t(agentStateLabelKey(agent))}</span>
        {skillsCount > 0 && (
          <span>· {t("agents.nodeSkills", { count: skillsCount })}</span>
        )}
        {othersCount > 0 && (
          <span>· {t("agents.nodeFiles", { count: othersCount })}</span>
        )}
      </div>

      {/* A plain div, not a label: the switch's own aria-label is its whole
          accessible name, matching the settings dialog's switches. */}
      <div className="mt-0.5 flex items-center justify-between gap-3 rounded-md px-1 py-1.5 text-[12px] font-medium">
        <span>{t("agents.connect")}</span>
        <Switch
          checked={agent.linked || pinned}
          disabled={pinned || busy}
          onCheckedChange={onToggleLink}
          aria-label={t("agentLink.toggleAria", { name: agent.display })}
        />
      </div>

      <PopoverDescription className="text-[11px] leading-relaxed">
        {pinned ? t("agents.nativeHint") : t("agents.nodeHint")}
      </PopoverDescription>
    </PopoverContent>
  );
}

/** Observe an element's content-box width; 0 until the first measurement. */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
