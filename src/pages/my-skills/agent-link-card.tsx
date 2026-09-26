import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Bot, ChevronRight } from "lucide-react";

import { fetchAgentStatus } from "../../lib/local-skills";
import { agentLinkState } from "../../lib/agent-link-state";
import { Card } from "../../components/ui/card";
import { AgentAvatarGroup } from "./agent-avatar-group";

/** Faces shown inline on the card before the rest fold into a +N count. */
const CARD_AVATAR_MAX = 5;

/**
 * The my-skills page's doorway into the agents graph. Managing the skills of
 * several agents at once is the app's core job, so instead of the old header
 * avatar strip it gets one full-width status card — the detected faces, how
 * many of them are linked, and how many need attention — and the whole card is
 * the link to `/my-skills/agents`. The card carries no action itself: linking
 * is automatic, and the one control (the link settings dialog) lives on the
 * page the card opens.
 */
export function AgentLinkCard() {
  const { t } = useTranslation();
  const { data: agents, isLoading, isError } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    staleTime: 0,
  });

  // A quiet placeholder keeps the list's first row from jumping when the
  // cached agent status revalidates; an error says nothing here — the agents
  // page itself owns the error surface.
  if (isLoading) {
    return (
      <div aria-hidden="true" className="h-14 animate-pulse rounded-xl bg-muted/60" />
    );
  }
  if (isError) return null;

  const list = agents ?? [];
  const linkedCount = list.filter(
    (agent) => agent.linked || agent.canonical,
  ).length;
  const attentionCount = list.filter(
    (agent) => agentLinkState(agent) === "warning",
  ).length;

  return (
    <Link
      to="/my-skills/agents"
      aria-label={t("agents.openAria")}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card
        size="sm"
        className="flex-row items-center gap-4 px-4 transition-colors hover:bg-muted/50"
      >
        {list.length > 0 ? (
          <AgentAvatarGroup agents={list} max={CARD_AVATAR_MAX} />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bot className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">
            {t("agents.cardTitle")}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {list.length === 0 ? (
              t("agentLink.noAgents")
            ) : (
              <>
                <span>
                  {t("agents.cardSummary", {
                    linked: linkedCount,
                    total: list.length,
                  })}
                </span>
                {attentionCount > 0 && (
                  <span className="text-amber-600 dark:text-amber-500">
                    {" "}
                    · {t("agents.cardAttention", { count: attentionCount })}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Card>
    </Link>
  );
}
