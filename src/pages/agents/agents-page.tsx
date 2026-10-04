import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Columns2, Loader2, RefreshCw, Users, Waypoints } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { agentLinkState } from "../../lib/agent-link-state";
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
 * into one hub-and-spoke graph (see `AgentGraph`). The central dashboard card
 * displays skill totals, active status and quick actions; linking is controlled
 * via explicit switches and inspection dialogs on each agent card.
 */
export function AgentsPage() {
  const { t } = useTranslation();
  const layoutMode = useAgentsLayout();
  const toColumns = layoutMode === "constellation";

  const {
    data: agents,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    staleTime: 0,
  });

  const list = agents ?? [];
  const linkedCount = list.filter(
    (agent) => agentLinkState(agent) === "linked",
  ).length;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-muted-foreground">
            {t("agents.head.linkedAgents", { count: linkedCount })}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Refresh Agent Detection Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t(
                    isFetching ? "agents.head.refreshing" : "agents.head.refresh",
                  )}
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <RefreshCw
                    className={`size-3.5 ${isFetching ? "animate-spin" : ""}`}
                  />
                </button>
              }
            />
            <TooltipContent side="bottom">
              {t("agents.head.refresh")}
            </TooltipContent>
          </Tooltip>

          {/* Layout Toggle Button */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
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
