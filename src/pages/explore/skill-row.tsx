import { memo, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useAppLocale } from "../../i18n/use-language";
import { skillDescription } from "../../lib/i18n-content";
import { Ordinal } from "../../components/ordinal";
import {
  isInstallableSkill,
  isLiveSkill,
  skillDisplayName,
  skillKey,
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

export type { SkillMatched };

/**
 * The lift and ring an interactive card gets on hover and focus. Shared by every
 * surface that answers a click with a card, so a list row and the cards it sits
 * among cannot animate differently.
 */
const INTERACTIVE_CLASS =
  "cursor-pointer transition-all duration-150 hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * One skill in a collection page's list — a repository's own skills, or the
 * installed list's local pool, read as a list rather than as the store's
 * multi-column grid.
 *
 * The row is the store card laid on its side, and it keeps the card's order of
 * address: the ordinal first (the list's one addition — where this skill stands
 * in the whole collection, top three medalled), then the skill's classification
 * glyph, then *what is it* (the name) over *what does it do* (the description),
 * and finally the facts as a quiet cluster on the far right: the source's owner
 * face — the repository's own name lives on the detail panel, so the row keeps
 * only the face — the figure the list answers in (`fact`), and the corner
 * action. A row is read one
 * at a time, top to bottom, which is exactly what a list is for — the ordinals
 * give the eye a single column to run down, and the facts line up so two rows
 * can be compared without re-reading them.
 *
 * The leading glyph is the classification, not the owner: on a repository's own
 * page the owner is the same for every row and says nothing, while the domain is
 * the one fact that varies row to row. Pointing at the glyph names the domain,
 * its scope and any other domains the skill belongs to. A skill nothing
 * classified wears the question mark, a box stands for the dataset's own
 * 其他, and both are filled in by `domainEmoji` — the same resolver the card's
 * slot calls, so the two surfaces cannot mark one skill two ways.
 *
 * It is bound to the store like the standalone skill card is: the corner
 * action is the install button. Unlike the card it is a full-width row with
 * no grid cell to fill, so it is its own shape (as `RepoCard` is), sharing
 * only the interaction and the ordinal ink with the surfaces around it.
 *
 * Everything it shows is read off the skill, so it renders a registry row and
 * an installed row the same way; a skill whose entry is unknown (`storeBacked`)
 * states its source as 本地安装 and drops the figure rather than fabricating a
 * zero, exactly as the card does.
 *
 * **The row is memoized, and it is handed a handler rather than a closure.** A
 * list of skills is the one surface where "re-render the page" and "re-render
 * every row in it" are the same cost, so a row that re-renders whenever its
 * parent does makes the list cost its own size times over — for a settled
 * search word, a streamed index, a revealed page, a selected row. `onSelect`
 * therefore takes the row's own key and every caller passes a handler it
 * already had (a state setter, a shared callback) instead of building a fresh
 * `() => open(key)` per row, which would hand every row a new prop on every
 * render and make the memoization worth nothing.
 */
export const SkillRow = memo(function SkillRow({
  skill,
  matched,
  index,
  selected = false,
  showSource = true,
  onSelect,
  action,
  muted = false,
  extra,
  ranked = true,
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
  /** Zero-based position in the list; the row prints `index + 1`. */
  index: number;
  /** Whether this row is the one shown in the detail panel. */
  selected?: boolean;
  /**
   * Whether to name the source. A repository's own page states it once in the
   * head, so repeating it on every row is noise there; a list that gathers
   * skills from many repositories keeps it.
   */
  showSource?: boolean;
  /**
   * Opens the skill detail panel, addressed by the row's own key. Without it the
   * row is not a button.
   */
  onSelect?: (key: string) => void;
  /** The row's corner control; absent means the store's install button. */
  action?: ReactNode;
  /** Dimmed presentation: an installed skill that is disabled. */
  muted?: boolean;
  /**
   * Fills the source slot when this skill has no source: the third-party
   * mark, made pressable when namesake candidates exist to link. It stands in
   * for the owner face rather than trailing the facts cluster, so a surface
   * hands over one thing — how to state this skill's origin — not two.
   */
  extra?: ReactNode;
  /**
   * Whether the list is ranked or merely enumerated: a ranked list medals its
   * top three, an enumeration — a pool of installs that carries no order to win
   * — prints plain numbers.
   */
  ranked?: boolean;
  /**
   * Which fact the fixed figure slot states — the figure the list answers in,
   * so the number beside a row is always the one the list above it was
   * ordered by. `popularity` (the default) states the registry's blended
   * figure, the order the store browses in and the installed list's default;
   * `installedAt` states the install's own clock, the figure the installed
   * list's 安装时间 grouping orders by. The two are told apart by data, not
   * by surface: the blend is a registry fact, so it renders only on a
   * store-backed row, while the stamp is a local fact every install carries
   * (rendering nothing when its record is missing — an absent fact, not a
   * zero).
   */
  fact?: "popularity" | "installedAt";
  /** Whether this row can be selected in a multi-selection flow. */
  checkable?: boolean;
  /** Whether this row is checked in multi-selection. */
  checked?: boolean;
  /** Callback fired when multi-selection check state toggles. */
  onCheckChange?: (checked: boolean) => void;
  /** Whether multi-selection mode is active across the list/grid. */
  selectionMode?: boolean;
}) {
  // The row's own identity, and the one handler it needs to answer a click with
  // it — built here so a caller can pass a handler it already had.
  const key = skillKey(skill);
  const select = useMemo(
    () => (onSelect ? () => onSelect(key) : undefined),
    [onSelect, key],
  );

  // Absent means backed: every row a collection page lists comes from the
  // registry, and the flag only ever unsets a caller with no store entry.
  const storeBacked = skill.storeBacked !== false;
  // The owner segment is what the source line names; a bare-host source is its
  // own owner, and an empty repo (an installed skill with no recorded source)
  // has none.
  const [owner] = skill.repo.split("/");
  const domain = skill.profile?.domain;
  // A live skills.sh row claims nothing its source does not carry — which is
  // no description and no classification at all — so it draws neither the
  // 暂无描述 placeholder nor the ❓ mark (see `isLiveSkill`); an installed
  // row the store cannot resolve is a local fact, and keeps both.
  const live = isLiveSkill(skill);
  const locale = useAppLocale();
  const { t } = useTranslation();

  const handleCardClick = () => {
    if (checkable && selectionMode) {
      onCheckChange?.(!checked);
    } else {
      select?.();
    }
  };

  return (
    <li className="flex flex-col">
      <Card
        size="sm"
        role={select || (checkable && selectionMode) ? "button" : undefined}
        tabIndex={select || (checkable && selectionMode) ? 0 : undefined}
        aria-label={
          select
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
          "group/row flex-row items-center px-3",
          (select || (checkable && selectionMode)) && INTERACTIVE_CLASS,
          selected && "border-primary ring-1 ring-primary",
          checked && "border-primary ring-1 ring-primary bg-primary/5",
          muted && "opacity-60",
        )}
      >
        {/* Leading position: Ordinal number and hoverable/selectable Checkbox in the exact same spot */}
        <div className="relative flex size-6 shrink-0 items-center justify-center">
          <div
            className={
              checkable
                ? cn(
                    "flex size-full items-center justify-center transition-opacity duration-150",
                    selectionMode || checked
                      ? "opacity-0 pointer-events-none"
                      : "opacity-100 group-hover/row:opacity-0 group-focus-within/row:opacity-0 pointer-events-auto",
                  )
                : undefined
            }
          >
            <Ordinal index={index} ranked={ranked} />
          </div>
          {checkable && (
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-opacity duration-150",
                selectionMode || checked
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:pointer-events-auto",
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
        </div>

        {/* The owner avatar leads the row. A skill with no source wears the third-party mark
            (or the suggestion badge `extra` when linkable). When `!showSource`,
            a fixed placeholder preserves column alignment without repeating the source. */}
        {!showSource ? (
          <span
            aria-hidden="true"
            className="size-7 shrink-0"
          />
        ) : owner ? (
          <div className="relative inline-flex shrink-0 items-center">
            <OwnerAvatar
              owner={owner}
              className="size-7 shrink-0 text-xs"
            />
            {skill.origin === "local" && (
              <span
                title={t("detail.sourceViaLink")}
                className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center rounded-full bg-amber-500 ring-1 ring-background"
              />
            )}
          </div>
        ) : (
          (extra ?? <ThirdPartyMark className="size-7" />)
        )}

        {/* What is it, and what does it do: the two lines every row leads with,
            both clamped to one line so the list stays a list. A live row states
            no description — its source publishes none, so the line claims
            nothing rather than a placeholder. */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-medium leading-tight">
            <HighlightedText text={skillDisplayName(skill)} terms={matched?.name} />
          </h3>
          {!live && (
            <p className="truncate text-[12px] leading-snug text-muted-foreground">
              {skillDescription(skill, locale) || t("common.noDescription")}
            </p>
          )}
        </div>

        {/* The facts cluster, pushed to the far end and kept whole: the source's
            owner face, then the figure the list answers in — both short and
            fixed, so the description keeps the width it needs. The face drops
            out on a repository's own page (see `showSource`): the head already
            names it, and 48 identical copies only crowd the names. A skill with
            no source at all wears the third-party mark in the same slot — it is
            the same column, sized the same, so the figures stay aligned across a
            list that mixes the two kinds. The classification lives on the
            leading glyph, so it is not repeated here. The figure takes a fixed
            right-aligned slot,
            sized to the format's longest rendering ("169.6K" for the blend,
            a relative age like "12个月前" for the stamp): the digits then end
            on one edge at the row's far right, where magnitudes are compared,
            and the face left of it sits in a column of its own instead of
            drifting with the digits' width. */}
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          {!live && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="flex size-5 shrink-0 items-center justify-center text-sm leading-none">
                    {domainEmoji(domain)}
                  </span>
                }
              />
              <TooltipContent>{domainTooltip(domain ?? [], locale)}</TooltipContent>
            </Tooltip>
          )}
          {fact === "installedAt" ? (
            <SkillInstalledTime
              skill={skill}
              align="end"
              className="w-24 justify-end"
            />
          ) : (
            storeBacked && (
              <SkillPopularity
                skill={skill}
                align="end"
                className="w-16 justify-end"
              />
            )
          )}
        </div>

        {/* The corner action. Clicks on the slot stop here: the row body opens
            the detail panel, the action must not. The installed list hands over
            the enable switch; the store's rows keep the install button — a
            live hit whose source no install id can be rebuilt from (a
            discovery domain) gets neither, since its install could only fail. */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {action ??
            (isInstallableSkill(skill) ? <SkillInstallButton skill={skill} /> : null)}
        </div>
      </Card>
    </li>
  );
});
