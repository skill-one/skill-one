import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Settings2, Users } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { cn, errorMessage } from "../../lib/utils";
import { AgentIcon } from "../../components/agent-icon";
import { Placeholder } from "../../components/placeholder";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { AgentAvatarGroup } from "./agent-avatar-group";
import {
  agentLinkState,
  agentStateDotClass,
  agentStateLabelKey,
} from "./agent-link-state";
import { AgentLinkSettingsDialog } from "./agent-link-settings-dialog";

/**
 * The agent link strip on the "my skills" page: a shadcn avatar group that
 * opens one dropdown menu listing every detected agent and its link state.
 *
 * Linking is automatic — `useAutoLinkAgents` links every detected agent at
 * startup — so the menu is a status view, not an action surface. Its one
 * control is the settings gear, which opens the per-agent link settings
 * dialog where individual agents can be unlinked (opting them out of the
 * auto-link pass).
 *
 * Every agent keeps the same treatment no matter how many are detected — the
 * strip only ever shows a prefix of them inline, while the menu lists all.
 */
export function AgentAvatarMenu() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
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

  return (
    <div>
      {isError ? (
        <Placeholder
          icon={Users}
          className="h-auto min-h-0 gap-1.5 py-8 pb-0"
          message={t("state.loadFailed", { message: errorMessage(error) })}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <Placeholder
          icon={Users}
          className="h-auto min-h-0 gap-1.5 py-8 pb-0"
          message={t("agentLink.noAgents")}
        />
      ) : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={t("agentLink.triggerAria", {
                  count: list.length,
                })}
                className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <AgentAvatarGroup agents={list} />
              </button>
            }
          />

          {/* The menu lists every agent, including the ones the strip folds
              into its +N count, so all of them are visible the same way. */}
          <DropdownMenuContent align="start" className="min-w-64">
            {/* Base UI's GroupLabel must live inside a Group, so the header
                label and the agent rows share one. */}
            <DropdownMenuGroup>
              {/* A plain div, not GroupLabel: Base UI hides group labels from
                  the accessibility tree, which would hide the gear below. */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-normal text-muted-foreground">
                  {t("agentLink.menuHeader", { count: list.length })}
                </span>
                {/* The single control: opens the per-agent settings dialog.
                    The menu closes first so the modal dialog does not sit on
                        top of it. */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("agentLink.dialogTitle")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    // The menu hands focus back to the trigger as it
                    // closes; opening the dialog one frame later keeps the
                    // two from fighting over it.
                    requestAnimationFrame(() => setSettingsOpen(true));
                  }}
                >
                  <Settings2 />
                </Button>
              </div>
              <DropdownMenuSeparator />
              {list.map((agent) => {
                const skillsCount = agent.internalSkills?.length ?? 0;
                const othersCount = agent.internalOthers?.length ?? 0;
                return (
                  <DropdownMenuItem
                    key={agent.name}
                    className="gap-2.5"
                    // Status rows only: linking and unlinking live in the
                    // settings dialog, so selecting a row does nothing (and
                    // must not close the menu).
                    closeOnClick={false}
                  >
                    <AgentIcon agentName={agent.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">
                        {agent.display}
                      </div>
                      {/* Pending-action counts, shown only when there is
                          something a link would do to this agent's dir:
                          adopt its skills, quarantine the rest. */}
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
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          agentStateDotClass[agentLinkState(agent)],
                        )}
                      />
                      {t(agentStateLabelKey(agent))}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AgentLinkSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
