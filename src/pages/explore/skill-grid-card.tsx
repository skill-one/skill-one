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
import { ThirdPartyMark } from "../../components/third-party-mark";
import { SkillInstallButton } from "../../components/skill-install-button";
import { SkillInstalledTime } from "../../components/skill-installed-time";
import { SkillPopularity } from "../../components/skill-popularity";
import { Card } from "../../components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";

import { Checkbox } from "../../components/ui/checkbox";

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
  checkable = false,
  checked = false,
  onCheckChange,
  selectionMode = false,
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
  /**
   * Fills the source slot when this skill has no source: the third-party
   * mark, made pressable when namesake candidates exist to link. It stands in
   * for the owner face rather than trailing the footer, so a surface hands over
   * one thing — how to state this skill's origin — not two.
   */
  extra?: ReactNode;
  /**
   * Which fact the footer states — the figure the list answers in, so the
   * number beside a square is always the one the list above it was ordered
   * by. Same contract as `SkillRow`'s `fact`.
   */
  fact?: "popularity" | "installedAt";
  /** Whether this square can be selected in a multi-selection flow. */
  checkable?: boolean;
  /** Whether this square is checked in multi-selection. */
  checked?: boolean;
  /** Callback fired when multi-selection check state toggles. */
  onCheckChange?: (checked: boolean) => void;
  /** Whether multi-selection mode is active across the list/grid. */
  selectionMode?: boolean;
}) {
  const storeBacked = skill.storeBacked !== false;
  const [owner] = skill.repo.split("/");
  const domain = skill.profile?.domain;
  const live = isLiveSkill(skill);
  const locale = useAppLocale();
  const { t } = useTranslation();

  const handleCardClick = () => {
    if (checkable && selectionMode) {
      onCheckChange?.(!checked);
    } else {
      onSelect?.();
    }
  };

  return (
    <li className="flex min-w-0 flex-col">
      <Card
        size="sm"
        role={onSelect || (checkable && selectionMode) ? "button" : undefined}
        tabIndex={onSelect || (checkable && selectionMode) ? 0 : undefined}
        aria-label={
          onSelect
            ? t("common.viewDetailAria", { name: skillDisplayName(skill) })
            : undefined
        }
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className={cn(
          "relative group/card aspect-square p-3",
          (onSelect || (checkable && selectionMode)) && INTERACTIVE_CLASS,
          selected && "border-primary ring-1 ring-primary",
          checked && "border-primary ring-1 ring-primary bg-primary/5",
          muted && "opacity-60",
        )}
      >
        {/* Floating selection checkbox: visible on card hover or when selection mode is active */}
        {checkable && (
          <span
            className={cn(
              "absolute top-2.5 right-2.5 z-10 rounded bg-background/90 p-0.5 shadow-xs transition-opacity backdrop-blur-xs",
              selectionMode || checked
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:pointer-events-auto",
            )}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(c) => onCheckChange?.(Boolean(c))}
              aria-label={t("multiSelect.selectSkillAria", {
                name: skillDisplayName(skill),
              })}
            />
          </span>
        )}
        {/* Name row: owner avatar plus the name, both on one line. */}
        <div className={cn("flex min-w-0 items-center gap-2", checkable && "pr-6")}>
          {owner ? (
            <OwnerAvatar
              owner={owner}
              className="size-6 shrink-0 text-[10px]"
            />
          ) : (
            (extra ?? (
              <ThirdPartyMark
                name={skillDisplayName(skill)}
                className="size-6 shrink-0 text-[10px]"
              />
            ))
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

        {/* Footer: category glyph, the figure the list answers in, corner action. */}
        <div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
          {!live && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="flex size-4 shrink-0 items-center justify-center text-xs leading-none">
                    {domainEmoji(domain)}
                  </span>
                }
              />
              <TooltipContent>
                {domainTooltip(domain ?? [], locale)}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="ml-auto flex shrink-0 items-center">
            {fact === "installedAt" ? (
              <SkillInstalledTime skill={skill} align="end" />
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
