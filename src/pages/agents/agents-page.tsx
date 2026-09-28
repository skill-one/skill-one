import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Columns2, Loader2, Orbit, Users } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { agentLinkState } from "../../lib/agent-link-state";
import {
  getAgentsLayout,
  setAgentsLayout,
  type AgentsLayoutMode,
} from "../../lib/agents-layout-preference";
import { errorMessage } from "../../lib/utils";
import { Placeholder } from "../../components/placeholder";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { AgentGraph } from "./agent-graph";

/** The two graph presentations, with their icons and label keys. */
const LAYOUT_OPTIONS: ReadonlyArray<{
  mode: AgentsLayoutMode;
  icon: typeof Orbit;
  labelKey: "agents.layout.constellation" | "agents.layout.columns";
}> = [
  { mode: "constellation", icon: Orbit, labelKey: "agents.layout.constellation" },
  { mode: "columns", icon: Columns2, labelKey: "agents.layout.columns" },
];

/**
 * The agents page — the app's home. Every agent this machine detects is drawn
 * into one hub-and-spoke graph (see `AgentGraph`): the picture is the product,
 * one SkillOne core with every agent's skills flowing into it — which is why the
 * window opens here and the brand in the header leads back. The head states the
 * figures behind the picture; linking is done straight from each agent's card
 * and stays automatic everywhere else.
 */
export function AgentsPage() {
  const { t } = useTranslation();
  // The presentation choice is the user's, persisted across launches.
  const [layoutMode, setLayoutMode] = useState<AgentsLayoutMode>(() =>
    getAgentsLayout(),
  );

  const chooseLayout = (mode: AgentsLayoutMode) => {
    setLayoutMode(mode);
    setAgentsLayout(mode);
  };
  const {
    data: agents,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    staleTime: 0,
  });

  const list = agents ?? [];
  const linkedCount = list.filter(
    (agent) => agent.linked || agent.canonical,
  ).length;
  const attentionCount = list.filter(
    (agent) => agentLinkState(agent) === "warning",
  ).length;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The home's head: the page's name over the figures behind the picture.
          No way back — this is where the window opens (see the app's routes),
          so there is nowhere above it to go. */}
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {t("agents.title")}
          </h1>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground tabular-nums">
            <span>
              {t("agents.connected", {
                linked: linkedCount,
                total: list.length,
              })}
            </span>
            {attentionCount > 0 && (
              <span className="text-amber-600 dark:text-amber-500">
                · {t("agents.attention", { count: attentionCount })}
              </span>
            )}
          </p>
        </div>

        {/* Presentation switch: constellation scatter vs. balanced columns. */}
        <div
          role="group"
          aria-label={t("agents.layout.groupAria")}
          className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
        >
          {LAYOUT_OPTIONS.map(({ mode, icon: Icon, labelKey }) => {
            const active = layoutMode === mode;
            return (
              <Tooltip key={mode}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={t(labelKey)}
                      onClick={() => chooseLayout(mode)}
                      className={
                        active
                          ? "flex size-7 items-center justify-center rounded-md bg-muted text-foreground outline-none"
                          : "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      }
                    >
                      <Icon className="size-4" />
                    </button>
                  }
                />
                <TooltipContent side="bottom">{t(labelKey)}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <Placeholder
            icon={Users}
            message={t("state.loadFailed", {
              message: errorMessage(error),
            })}
          />
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <Placeholder icon={Users} message={t("agentLink.noAgents")} />
        ) : (
          <AgentGraph agents={list} mode={layoutMode} />
        )}
      </div>
    </div>
  );
}
