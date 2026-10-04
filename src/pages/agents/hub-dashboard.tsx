import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Compass, Layers, Loader2, Sparkles } from "lucide-react";

import type { AgentStatus, InstalledSkill } from "../../lib/skills-manager";
import { agentLinkState } from "../../lib/agent-link-state";
import { domainEmoji } from "../../data/domains";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";

interface HubDashboardProps {
  agents: AgentStatus[];
  skills: InstalledSkill[];
  loading?: boolean;
  className?: string;
  width?: number;
}

/**
 * Modern dashboard card acting as the SkillOne core hub.
 * Replaces the heavy physics jar with a clean, actionable status center.
 */
export function HubDashboard({
  agents,
  skills,
  loading = false,
  className,
  width = 380,
}: HubDashboardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const total = skills.length;
  const enabled = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  );

  const linkedAgentsCount = agents.filter(
    (agent) => agentLinkState(agent) === "linked",
  ).length;

  const attentionCount = agents.filter(
    (agent) => agentLinkState(agent) === "warning",
  ).length;

  // Resolve classification emojis for skills
  const { data: provenance } = useSkillProvenance();
  const storeEntries = useInstalledStoreEntries(provenance?.linked);

  const getEmoji = (name: string) => {
    return domainEmoji(storeEntries[name]?.profile?.domain) ?? "⚡";
  };

  return (
    <Card
      role="figure"
      aria-label={t("agents.hub.diskAria", {
        enabled: enabled.length,
        total,
      })}
      data-slot="hub-dashboard"
      style={{ width }}
      className={cn(
        "relative select-none border-border/80 bg-card/95 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      {/* Attention Chip */}
      {attentionCount > 0 && (
        <span
          title={t("agents.attention", { count: attentionCount })}
          className="absolute -top-2.5 right-3 z-10 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
        >
          {t("agents.attention", { count: attentionCount })}
        </span>
      )}

      <CardHeader className="p-3.5 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold leading-none">
                {t("agents.hub.title")}
              </CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("agents.hub.tagline")}
              </p>
            </div>
          </div>

          {/* Stats Badges */}
          <div className="flex flex-col items-end gap-1">
            <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-medium tabular-nums">
              <span className="font-semibold text-foreground">{enabled.length}</span>
              <span className="text-muted-foreground">/{total}</span>
              <span className="ml-1 text-[10px] text-muted-foreground">
                {t("agents.hub.skillsLabel")}
              </span>
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {t("agents.hub.coverage", {
                linked: linkedAgentsCount,
                total: agents.length,
              })}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 pt-0 space-y-3">
        {/* Active Skills List / Flow */}
        <div className="rounded-lg border border-border/60 bg-muted/40 p-2">
          {loading ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : enabled.length === 0 ? (
            <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
              {t("agents.hub.noneEnabled")}
            </div>
          ) : (
            <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {enabled.slice(0, 16).map((skill) => (
                <Tooltip key={skill.name}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        data-skill={skill.name}
                        onClick={() => navigate("/installed")}
                        className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:border-primary/50 hover:bg-accent/50 cursor-pointer"
                      >
                        <span className="text-[12px] leading-none">
                          {getEmoji(skill.name)}
                        </span>
                        <span className="max-w-[90px] truncate">
                          {skill.displayName ?? skill.name}
                        </span>
                      </button>
                    }
                  />
                  <TooltipContent side="top">
                    {skill.displayName ?? skill.name} · {t("agents.hub.openSkill")}
                  </TooltipContent>
                </Tooltip>
              ))}
              {enabled.length > 16 && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                >
                  +{enabled.length - 16}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Link
            to="/explore"
            className={buttonVariants({
              variant: "default",
              size: "sm",
              className: "h-7 flex-1 text-xs",
            })}
          >
            <Compass className="mr-1.5 size-3.5" />
            {t("agents.hub.browseStore")}
          </Link>
          <Link
            to="/installed"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "h-7 flex-1 text-xs",
            })}
          >
            <Layers className="mr-1.5 size-3.5" />
            {t("agents.hub.manage")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
