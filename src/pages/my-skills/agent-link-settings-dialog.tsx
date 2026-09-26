import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { useAgentLinkToggle } from "../../hooks/use-agent-link-toggle";
import { fetchAgentStatus } from "../../lib/local-skills";
import { cn, errorMessage } from "../../lib/utils";
import { AgentIcon } from "../../components/agent-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Switch } from "../../components/ui/switch";
import { agentStateDotClass, agentLinkState } from "../../lib/agent-link-state";

/**
 * Per-agent link control, opened from the agents page's settings button.
 *
 * Linking is automatic everywhere else — this dialog is the one place a user
 * can opt an agent out. A switch off unlinks the agent and records the
 * exclusion so the auto-link pass never touches it again; a switch back on
 * re-links it (adopting whatever its own skills dir still holds) and clears the
 * exclusion. Canonical agents use their native skills directory, so their
 * switch is pinned on and disabled.
 *
 * Linking is one-way since agents-skills 0.15, and the description says so:
 * adopted skills stay in the canonical directory after an unlink, so the dialog
 * never implies a restore. Every action writes through the backend and lands as
 * a toast, like `SkillEnableSwitch` — no confirm step, since re-linking is one
 * click away.
 */
export function AgentLinkSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();

  // Shared cache with the graph; fetching is gated on open so the
  // dialog costs nothing while closed.
  const {
    data: agents,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    enabled: open,
  });

  const { toggle, busyFor } = useAgentLinkToggle();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("agentLink.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("agentLink.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">
            {t("state.loadFailed", { message: errorMessage(error) })}
          </p>
        ) : isLoading || !agents ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
            {agents.map((agent) => {
              const skillsCount = agent.internalSkills?.length ?? 0;
              const othersCount = agent.internalOthers?.length ?? 0;
              const pinned = agent.canonical;
              return (
                <div
                  key={agent.name}
                  className="flex items-center gap-2.5 py-2.5"
                >
                  <AgentIcon agentName={agent.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{agent.display}</div>
                    {(skillsCount > 0 || othersCount > 0) && (
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {skillsCount > 0 && (
                          <span>
                            {t("agentLink.skillsPending", {
                              count: skillsCount,
                            })}
                          </span>
                        )}
                        {othersCount > 0 && (
                          <span>
                            {t("agentLink.filesPending", {
                              count: othersCount,
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      agentStateDotClass[agentLinkState(agent)],
                    )}
                  />
                  <Switch
                    checked={agent.linked || pinned}
                    disabled={pinned || busyFor(agent.name)}
                    onCheckedChange={(link) =>
                      toggle.mutate({ name: agent.name, link })
                    }
                    aria-label={t("agentLink.toggleAria", {
                      name: agent.display,
                    })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
