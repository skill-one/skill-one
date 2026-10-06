import { CalendarDays } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { useAppLocale } from "../i18n/use-language";
import type { SkillView } from "../lib/skill-view";
import { cn, formatSmartTime, formatUnixDate } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * The install's own clock, as a row fact — the counterpart of
 * `SkillPopularity` for the fact only an on-disk record carries: when this
 * copy landed on disk (`SkillView.installedAt`, Unix seconds). It is the
 * figure the installed list's 安装时间 sort orders by, so a list read in that
 * order displays it where the popularity sort displays the blend — the number
 * beside a row is always the one the list above it was answered in.
 *
 * The trigger states progressive time ("3天前" within 30 days, or compact
 * date e.g. "8月12日" beyond 30 days), balancing recency feeling with long-term
 * precision; hovering or focusing reveals the exact timestamp. An unrecorded
 * time renders nothing at all.
 */
export function SkillInstalledTime({
  skill,
  className,
  side = "top",
  align = "center",
}: {
  /** The skill whose install stamp is stated. */
  skill: SkillView;
  className?: string;
  /** Tooltip placement; callers open it above the stamp. */
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
}) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const displayTime = formatSmartTime(skill.installedAt, locale);
  // One guard for both renderings: no recorded time, no fact to state.
  if (!displayTime) return null;
  const exact = formatUnixDate(skill.installedAt, locale);

  return (
    // The app-level TooltipProvider (App.tsx) owns the delay group.
    <Tooltip>
      <TooltipTrigger
        aria-label={t("common.installedTimeAria", { relative: displayTime, exact })}
        // The stamp sits on a clickable surface (a list row opens the detail
        // panel); a click on it stays there.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex shrink-0 cursor-default items-center gap-1 rounded text-[12px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
      >
        <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap font-medium tabular-nums">
          {displayTime}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {/* One line: the trigger already shows the age, so the tooltip
            reveals only the exact date behind it. */}
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="whitespace-nowrap">
            {t("detail.installedAtLabel")}
            {exact}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
