import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Settings2, Users } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { agentLinkState } from "../../lib/agent-link-state";
import { errorMessage } from "../../lib/utils";
import { DrillDownHead } from "../../components/drill-down-head";
import { Placeholder } from "../../components/placeholder";
import { Button } from "../../components/ui/button";
import { AgentLinkSettingsDialog } from "../my-skills/agent-link-settings-dialog";
import { AgentGraph } from "./agent-graph";

/**
 * The agents page — the management hub itself. Every agent this machine
 * detects is drawn into one hub-and-spoke graph (see `AgentGraph`): the
 * picture is the product, one SkillOne core with every agent's skills flowing
 * into it. The head states the figures behind the picture and carries the
 * page's one control, the link settings dialog; linking itself stays automatic
 * everywhere else.
 */
export function AgentsPage() {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col px-8 pt-3 pb-5">
      <DrillDownHead
        back="/my-skills"
        title={t("agents.title")}
        meta={
          <>
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
          </>
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
            {t("agentLink.dialogTitle")}
          </Button>
        }
      />

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

      <AgentLinkSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
