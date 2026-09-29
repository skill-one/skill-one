import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Columns2, Loader2, Users, Waypoints } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { setAgentsLayout } from "../../lib/agents-layout-preference";
import { useAgentsLayout } from "../../hooks/use-agents-layout";
import { errorMessage } from "../../lib/utils";
import { Placeholder } from "../../components/placeholder";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { AgentGraph } from "./agent-graph";

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
  // The presentation reads live so a change re-renders the graph without a
  // remount. The toggle below flips it; the choice persists across launches.
  const layoutMode = useAgentsLayout();
  const toColumns = layoutMode === "constellation";
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

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The home's head is the idea itself: one line saying what the app
          does — install once, every agent uses it. The figures live on the
          hub card at the picture's centre, so nothing here competes with
          them. No way back — this is where the window opens (see the app's
          routes), so there is nowhere above it to go. The single toggle flips
          the graph between the columns and the constellation; its face names
          the way it goes, not where it is. */}
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {t("agents.hub.tagline")}
          </h1>
        </div>

        <div className="flex shrink-0 items-center rounded-lg border border-border bg-card p-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t(
                    toColumns
                      ? "agents.layout.switchToColumns"
                      : "agents.layout.switchToConstellation",
                  )}
                  onClick={() =>
                    setAgentsLayout(toColumns ? "columns" : "constellation")
                  }
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {toColumns ? (
                    <Columns2 className="size-4" />
                  ) : (
                    <Waypoints className="size-4" />
                  )}
                </button>
              }
            />
            <TooltipContent side="bottom">
              {t(
                toColumns
                  ? "agents.layout.switchToColumns"
                  : "agents.layout.switchToConstellation",
              )}
            </TooltipContent>
          </Tooltip>
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
