import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Users } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { agentLinkState } from "../../lib/agent-link-state";
import { cn, errorMessage } from "../../lib/utils";
import { Placeholder } from "../../components/placeholder";
import { AgentGraph } from "./agent-graph";

/**
 * The agents page — the app's home. Every detected agent is rendered
 * in a balanced, symmetrical dual-column layout flanking the central SkillOne hub.
 * Agent connection and attention statuses are positioned at the top-left of the canvas,
 * allowing the central hub card to focus exclusively on skills.
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
  const linkedCount = list.filter((a) => agentLinkState(a) === "linked").length;
  const attentionCount = list.filter((a) => agentLinkState(a) === "warning").length;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 py-3">
      {/* Top-left Agent connection and attention status */}
      {!isLoading && !isError && list.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 pb-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                linkedCount > 0
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                  : "bg-muted-foreground/40",
              )}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {t("agents.head.linkedAgents", { count: linkedCount })}
            </span>
          </div>

          {attentionCount > 0 && (
            <span
              title={t("agents.attention", { count: attentionCount })}
              className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
            >
              {t("agents.attention", { count: attentionCount })}
            </span>
          )}
        </div>
      )}

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
