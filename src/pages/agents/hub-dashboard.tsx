import { useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import type { AgentStatus, InstalledSkill } from "../../lib/skills-manager";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { OwnerAvatar } from "../../components/owner-avatar";
import { ThirdPartyMark } from "../../components/third-party-mark";
import { skillDisplayName } from "../../lib/skill-view";
import { cn } from "../../lib/utils";

interface HubDashboardProps {
  agents?: AgentStatus[];
  skills: InstalledSkill[];
  loading?: boolean;
  className?: string;
  width?: number;
}

/**
 * Modern dashboard card acting as the central SkillOne hub.
 * Uses a floating border notch header to maximize interior vertical space
 * for active skill chips with owner avatars.
 */
export function HubDashboard({
  skills,
  loading = false,
  className,
  width = 480,
}: HubDashboardProps) {
  const { t } = useTranslation();

  const total = skills.length;
  const enabled = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  );

  // Resolve classification and repository source for owner avatars
  const { data: provenance } = useSkillProvenance();
  const storeEntries = useInstalledStoreEntries(provenance?.linked);

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
        "relative select-none overflow-visible border-border/60 bg-card/90 shadow-sm backdrop-blur-md",
        className,
      )}
    >
      {/* Brand & Hub Title — Floating Notch on Top Border */}
      <div
        title={t("agents.hub.tagline")}
        className="absolute -top-3.5 left-4 z-10 flex max-w-[320px] items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-0.5 shadow-2xs backdrop-blur-md"
      >
        <img
          src="/skill-one-transparent.png"
          alt="Skill One"
          className="size-4 shrink-0 object-contain drop-shadow-xs"
        />
        <span className="truncate text-xs font-semibold tracking-tight text-foreground">
          {t("agents.hub.title")}
        </span>
        <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
          {t("agents.hub.tagline")}
        </span>
      </div>

      {/* Skills Stats Badge — Floating on Top-Right Border */}
      <div className="absolute -top-3 right-4 z-10">
        <Badge
          variant="secondary"
          className="border-border/60 bg-card/95 px-2 py-0 text-[11px] font-medium tabular-nums shadow-2xs backdrop-blur-md"
        >
          <span className="font-semibold text-foreground">{enabled.length}</span>
          <span className="text-muted-foreground">/{total}</span>
          <span className="ml-1 text-[10px] text-muted-foreground">
            {t("agents.hub.skillsLabel")}
          </span>
        </Badge>
      </div>

      <CardContent className="p-4 pt-5">
        {/* Active Skills Flow Container */}
        {loading ? (
          <div className="flex h-28 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : enabled.length === 0 ? (
          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
            {t("agents.hub.noneEnabled")}
          </div>
        ) : (
          <div className="flex min-h-[120px] flex-col justify-end">
            {/* Skill Chips Flow — bottom-up stacking with dynamic width */}
            <div className="flex max-h-60 flex-wrap-reverse content-end gap-1.5 overflow-y-auto pr-1 mt-auto">
              {visibleSkills.map((skill) => {
                const displayName = skillDisplayName(skill);
                const repo =
                  provenance?.linked?.[skill.name]?.repo ??
                  storeEntries[skill.name]?.repo;
                const owner = repo ? repo.split("/")[0] : undefined;

                return (
                  <span
                    key={skill.name}
                    data-skill={skill.name}
                    title={displayName}
                    className="inline-flex shrink-0 max-w-[160px] items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[11px] font-medium shadow-2xs transition-colors hover:bg-muted/60"
                  >
                    {owner ? (
                      <OwnerAvatar
                        owner={owner}
                        className="size-4 shrink-0 text-[8px]"
                      />
                    ) : (
                      <ThirdPartyMark
                        name={displayName}
                        className="size-4 shrink-0 text-[8px]"
                      />
                    )}
                    <span className="truncate">{displayName}</span>
                  </span>
                );
              })}

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
                        className="inline-flex shrink-0 items-center justify-center gap-0.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
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
      </CardContent>
    </Card>
  );
}
