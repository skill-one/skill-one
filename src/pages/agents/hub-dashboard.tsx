import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Compass, Layers, Loader2 } from "lucide-react";

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
 * Designed with seamless brand integration, clean borders and high scalability.
 */
export function HubDashboard({
  agents,
  skills,
  loading = false,
  className,
  width = 480,
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

  // Group domain statistics for overview when skills are numerous
  const domainSummary = useMemo(() => {
    if (enabled.length <= 16) return [];
    const counts = new Map<string, number>();
    for (const skill of enabled) {
      const domainList = storeEntries[skill.name]?.profile?.domain;
      const primaryKey = domainList && domainList.length > 0 ? domainList[0] : "other";
      counts.set(primaryKey, (counts.get(primaryKey) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        emoji: domainEmoji([key]) ?? "📦",
        count,
      }))
      .toSorted((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [enabled, storeEntries]);

  const maxVisibleChips = 50;
  const visibleSkills = enabled.slice(0, maxVisibleChips);
  const overflowCount = enabled.length - visibleSkills.length;

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
        "relative select-none border-border/60 bg-card/90 shadow-sm backdrop-blur-md",
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
          {/* Brand Logo & Hub Title — seamless with background like the app header */}
          <div className="flex items-center gap-2.5">
            <img
              src="/skill-one-transparent.png"
              alt="Skill One"
              className="size-6 shrink-0 object-contain drop-shadow-xs"
            />
            <div>
              <CardTitle className="text-sm font-semibold leading-none text-foreground">
                {t("agents.hub.title")}
              </CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("agents.hub.tagline")}
              </p>
            </div>
          </div>

          {/* Stats Badges */}
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant="secondary"
              className="border-border/40 bg-muted/60 px-1.5 py-0 text-[11px] font-medium tabular-nums"
            >
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

      <CardContent className="p-3.5 pt-0 space-y-2.5">
        {/* Active Skills List / Flow Container — light, blended background */}
        <div className="rounded-lg border border-border/40 bg-muted/25 p-2.5 min-h-[140px] flex flex-col justify-center">
          {loading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : enabled.length === 0 ? (
            <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
              {t("agents.hub.noneEnabled")}
            </div>
          ) : (
            <div className="space-y-2 my-auto">
              {/* Domain Summary Bar when 16+ skills */}
              {domainSummary.length > 0 && (
                <div className="flex items-center gap-2 border-b border-border/30 pb-1.5 text-[10px] text-muted-foreground">
                  <span className="shrink-0 font-medium text-foreground/80">
                    {t("agents.hub.activeSkills")}:
                  </span>
                  <div className="flex items-center gap-1.5 truncate">
                    {domainSummary.map((d) => (
                      <span
                        key={d.key}
                        className="inline-flex items-center gap-0.5 rounded border border-border/30 bg-background/80 px-1 py-0.5 font-medium tabular-nums"
                      >
                        <span>{d.emoji}</span>
                        <span>{d.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Skill Chips Flow */}
              <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {visibleSkills.map((skill) => (
                  <Tooltip key={skill.name}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          data-skill={skill.name}
                          onClick={() => navigate("/installed")}
                          className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/70 px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:border-primary/50 hover:bg-accent/60 cursor-pointer shadow-2xs"
                        >
                          <span className="text-[12px] leading-none">
                            {getEmoji(skill.name)}
                          </span>
                          <span className="max-w-[110px] truncate">
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

                {/* Interactive Overflow Button */}
                {overflowCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          to="/installed"
                          aria-label={t("agents.hub.viewAll", {
                            count: enabled.length,
                          })}
                          className="inline-flex items-center gap-0.5 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          <span>+{overflowCount}</span>
                          <span className="text-[9px]">全部 →</span>
                        </Link>
                      }
                    />
                    <TooltipContent side="top">
                      {t("agents.hub.viewAll", { count: enabled.length })}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
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
