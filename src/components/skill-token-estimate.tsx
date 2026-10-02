import { Coins } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { estimateTokens } from "../lib/token-estimate";
import type { SkillView } from "../lib/skill-view";
import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * The skill's estimated context cost, as a row fact — the counterpart of
 * `SkillPopularity` for the figure the installed list's Token 占用 sort orders
 * by: how many tokens the skill's English frontmatter description spends when
 * an agent loads it (`lib/token-estimate`, the same estimate the detail
 * drawer's meta line states, so the two can never disagree about one skill).
 *
 * The trigger keeps the facts rail's shared grammar — an icon marking the
 * metric over a bare figure, exactly as the popularity slot's flame and the
 * stamp's calendar do — with the coin standing for the cost the number names
 * (`T` alone would read as "trillion"). The hover carries the one sentence of
 * basis the number owes its reader. A skill with no description costs nothing
 * to state, so the fact is simply absent rather than a printed zero.
 */
export function SkillTokenEstimate({
  skill,
  className,
  side = "top",
  align = "center",
}: {
  /** The skill whose description cost is stated. */
  skill: SkillView;
  className?: string;
  /** Tooltip placement; callers open it above the figure. */
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
}) {
  const { t } = useTranslation();
  // Formatted once: the trigger and its tooltip read the same figure, so they
  // cannot disagree about what the estimate is.
  const count = estimateTokens(skill.description ?? "");
  // No description, no cost to state — the detail drawer draws nothing here
  // either, and a fabricated zero is not a fact.
  if (!skill.description) return null;

  return (
    // The app-level TooltipProvider (App.tsx) owns the delay group.
    <Tooltip>
      <TooltipTrigger
        aria-label={t("detail.tokensShortHint")}
        // The figure sits on a clickable surface (a list row opens the detail
        // panel); a click on it stays there.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex shrink-0 cursor-default items-center gap-1 rounded text-[12px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
      >
        <Coins aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium tabular-nums">{count}</span>
      </TooltipTrigger>
      <TooltipContent side={side} align={align}>
        <div className="text-[12px]">{t("detail.tokensShortHint")}</div>
      </TooltipContent>
    </Tooltip>
  );
}
