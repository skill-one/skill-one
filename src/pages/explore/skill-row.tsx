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

  return (
    <li className="flex flex-col">
      <Card
        size="sm"
        role={select ? "button" : undefined}
        tabIndex={select ? 0 : undefined}
        aria-label={select ? t("common.viewDetailAria", { name: skillDisplayName(skill) }) : undefined}
        onClick={select}
        onKeyDown={(e) => {
          if (select && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            select();
          }
        }}
        className={cn(
          "flex-row items-center px-3",
          select && INTERACTIVE_CLASS,
          selected && "border-primary ring-1 ring-primary",
          muted && "opacity-60",
        )}
      >
        {/* The list's one addition: where this skill stands in the collection,
            top three medalled when the list is ranked. The box is `Ordinal`'s,
            shared with the repository card's bar so the two shapes of one list
            number their entries the same way. */}
        <Ordinal index={index} ranked={ranked} />

        {/* The classification leads the row. The tip names the domain, its scope
            and any other domains the skill belongs to — and answers for a skill
            nothing classified, which wears the question mark here. A live row
            draws nothing in the slot, which stays fixed so the names still line
            up: nothing classified it, but nothing looked either. */}
        {live ? (
          <span
            aria-hidden="true"
            className="size-7 shrink-0 text-base leading-none"
          />
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex size-7 shrink-0 items-center justify-center text-base leading-none">
                  {domainEmoji(domain)}
                </span>
              }
            />
            <TooltipContent>{domainTooltip(domain ?? [], locale)}</TooltipContent>
          </Tooltip>
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
          {/* The source's face, or the third-party mark in its place: the same
              round box at the same size, with an amber broken-chain glyph where
              a sourced row has a person, so the two kinds of row read apart at a
              glance. `extra` is that mark when this skill can be linked — it
              fills the slot rather than trailing it, because the affordance and
              the fact are one thing here. */}
          {showSource &&
            (owner ? (
              <OwnerAvatar
                owner={owner}
                className="size-5 shrink-0 text-[9px]"
              />
            ) : (
              (extra ?? <ThirdPartyMark className="size-5" />)
            ))}
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
