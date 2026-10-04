import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Users } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { errorMessage } from "../../lib/utils";
import { Placeholder } from "../../components/placeholder";
import { AgentGraph } from "./agent-graph";

/**
 * The agents page — the app's home. Every detected agent is rendered
 * in a balanced, symmetrical dual-column layout flanking the central SkillOne hub.
 * Redundant top counts and manual refresh buttons have been removed in favor
 * of the Hub's unified coverage indicators and automated status queries.
 */
export function AgentsPage() {
  const { t } = useTranslation();

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
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 py-3">
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
          <AgentGraph agents={list} />
        )}
      </div>
    </div>
  );
}
