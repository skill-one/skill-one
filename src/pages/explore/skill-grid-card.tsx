import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useAppLocale } from "../../i18n/use-language";
import { skillDescription } from "../../lib/i18n-content";
import {
  isInstallableSkill,
  isLiveSkill,
  skillDisplayName,
  type SkillView,
} from "../../lib/skill-view";
import { cn } from "../../lib/utils";
import { domainEmoji, domainTooltip } from "../../data/domains";
import {
  HighlightedText,
  type SkillMatched,
} from "../../components/highlighted-text";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "../../components/skill-install-button";
import { SkillInstalledTime } from "../../components/skill-installed-time";
import { SkillPopularity } from "../../components/skill-popularity";
import { SkillTokenEstimate } from "../../components/skill-token-estimate";
import { Card } from "../../components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";

/**
 * The lift and ring an interactive card gets on hover and focus. Same recipe
 * as `SkillRow` so a grid square and a list row animate as one family.
 */
const INTERACTIVE_CLASS =
  "cursor-pointer transition-all duration-150 hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * One skill as a compact square: the minimal card of the grid unit.
 *
 * Three lines and nothing else — the classification glyph beside the name, a
 * two-line description, and a one-line footer (owner face, the figure the list
 * answers in, corner action). No ordinal: squares carry no ranking column, so
 * the top-three podium the row shape wears has nowhere to hang here.
 */
export function SkillGridCard({
  skill,
  matched,
  selected = false,
  onSelect,
  action,
  muted = false,
  extra,
  fact = "popularity",
}: {
  /** The skill to render, from the registry or from the installed list. */
  skill: SkillView;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  /** Whether this square is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel; without it the square is not a button. */
  onSelect?: () => void;
  /** The square's corner control; absent means the store's install button. */
  action?: ReactNode;
  /** Dimmed presentation: an installed skill that is disabled. */
  muted?: boolean;
  /** Trails the footer: the migration badge on an unlinked install. */
  extra?: ReactNode;
  /**
   * Which fact the footer states — the figure the list answers in, so the
   * number beside a square is always the one the list above it was ordered
   * by. Same contract as `SkillRow`'s `fact`.
   */
  fact?: "popularity" | "installedAt" | "tokens";
}) {
  const storeBacked = skill.storeBacked !== false;
  const [owner] = skill.repo.split("/");
  const domain = skill.profile?.domain;
  const live = isLiveSkill(skill);
  const locale = useAppLocale();
  const { t } = useTranslation();

  return (
    <li className="flex min-w-0 flex-col">
      <Card
        size="sm"
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={
          onSelect
            ? t("common.viewDetailAria", { name: skillDisplayName(skill) })
            : undefined
        }
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "aspect-square p-3",
          onSelect && INTERACTIVE_CLASS,
          selected && "border-primary ring-1 ring-primary",
          muted && "opacity-60",
        )}
      >
        {/* Name row: classification glyph plus the name, both on one line. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {live ? (
            <span aria-hidden="true" className="size-6 shrink-0" />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="flex size-6 shrink-0 items-center justify-center text-base leading-none">
                    {domainEmoji(domain)}
                  </span>
                }
              />
              <TooltipContent>
                {domainTooltip(domain ?? [], locale)}
              </TooltipContent>
            </Tooltip>
          )}
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight">
            <HighlightedText
              text={skillDisplayName(skill)}
              terms={matched?.name}
            />
          </h3>
        </div>

        {/* What it does, at most two lines so every square stays a square. */}
        {!live && (
          <p className="mt-1 line-clamp-2 min-h-0 flex-1 text-[12px] leading-snug text-muted-foreground">
            {skillDescription(skill, locale) || t("common.noDescription")}
          </p>
        )}
        {live && <div className="min-h-0 flex-1" />}

        {/* Footer: owner face, the figure the list answers in, corner action. */}
        <div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
          {owner ? (
            <OwnerAvatar
              owner={owner}
              className="size-4 shrink-0 text-[8px]"
            />
          ) : (
            (extra ?? (
              <span className="truncate">{t("common.localInstall")}</span>
            ))
          )}
          {!owner ? null : extra}
          <span className="ml-auto flex shrink-0 items-center">
            {fact === "installedAt" ? (
              <SkillInstalledTime skill={skill} align="end" />
            ) : fact === "tokens" ? (
              <SkillTokenEstimate skill={skill} align="end" />
            ) : (
              storeBacked && <SkillPopularity skill={skill} align="end" />
            )}
          </span>
          <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {action ??
              (isInstallableSkill(skill) ? (
                <SkillInstallButton skill={skill} className="h-7 w-7" />
              ) : null)}
          </span>
        </div>
      </Card>
    </li>
  );
}
