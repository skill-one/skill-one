import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useAppLocale } from "../../i18n/use-language";
import { skillDescription } from "../../lib/i18n-content";
import { ordinalClass } from "../../lib/ordinal";
import {
  isLiveSkill,
  type SkillView,
} from "../../lib/skill-view";
import { cn } from "../../lib/utils";
import { domainIcon, domainTooltip } from "../../data/domains";
import { DomainGlyph } from "../../components/domain-glyph";
import {
  HighlightedText,
  type SkillMatched,
} from "../../components/highlighted-text";
import { OwnerAvatar } from "../../components/owner-avatar";
import { INTERACTIVE_CLASS } from "../../components/skill-card";
import { SkillInstallButton } from "../../components/skill-install-button";
import { SkillInstalls } from "../../components/skill-installs";
import { Card } from "../../components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";

export type { SkillMatched };

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
 * only the face — the install figure, and the corner action. A row is read one
 * at a time, top to bottom, which is exactly what a list is for — the ordinals
 * give the eye a single column to run down, and the facts line up so two rows
 * can be compared without re-reading them.
 *
 * The leading glyph is the classification, not the owner: on a repository's own
 * page the owner is the same for every row and says nothing, while the domain is
 * the one fact that varies row to row. Pointing at the glyph names the domain,
 * its scope and any other domains the skill belongs to. A skill nothing
 * classified wears the help icon, mixed shapes stand for the dataset's own
 * 其他, and both are filled in by `domainIcon` — the same resolver the card's
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
 */
export function SkillRow({
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
  /** Opens the skill detail panel; without it the row is not a button. */
  onSelect?: () => void;
  /** The row's corner control; absent means the store's install button. */
  action?: ReactNode;
  /** Dimmed presentation: an installed skill that is disabled. */
  muted?: boolean;
  /** Trails the facts cluster: the migration badge on an unlinked install. */
  extra?: ReactNode;
  /**
   * Whether the list is ranked or merely enumerated: a ranked list medals its
   * top three, an enumeration — a pool of installs that carries no order to win
   * — prints plain numbers.
   */
  ranked?: boolean;
}) {
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
  // 暂无描述 placeholder nor the help mark (see `isLiveSkill`); an installed
  // row the store cannot resolve is a local fact, and keeps both.
  const live = isLiveSkill(skill);
  const locale = useAppLocale();
  const { t } = useTranslation();

  return (
    <li className="flex flex-col">
      <Card
        size="sm"
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? t("common.viewDetailAria", { name: skill.name }) : undefined}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "flex-row items-center px-3",
          onSelect && INTERACTIVE_CLASS,
          selected && "border-primary ring-1 ring-primary",
          muted && "opacity-60",
        )}
      >
        {/* The list's one addition: where this skill stands in the collection,
            top three medalled when the list is ranked. A fixed-width, centred
            box keeps every name in the list starting at the same offset whether
            the number is one or four digits. */}
        <span
          className={cn(
            "w-6 shrink-0 text-center text-sm",
            ordinalClass(index, ranked),
          )}
        >
          {index + 1}
        </span>

        {/* The classification leads the row. The tip names the domain, its scope
            and any other domains the skill belongs to — and answers for a skill
            nothing classified, which wears the help icon here. A live row
            draws nothing in the slot, which stays fixed so the names still line
            up: nothing classified it, but nothing looked either. */}
        {live ? (
          <span
            aria-hidden="true"
            className="size-7 shrink-0 leading-none"
          />
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
                  <DomainGlyph
                    icon={domainIcon(domain)}
                    className="size-4"
                  />
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
            <HighlightedText text={skill.name} terms={matched?.name} />
          </h3>
          {!live && (
            <p className="truncate text-[12px] leading-snug text-muted-foreground">
              {skillDescription(skill, locale) || t("common.noDescription")}
            </p>
          )}
        </div>

        {/* The facts cluster, pushed to the far end and kept whole: the source's
            owner face, then the install figure — both short and fixed, so the
            description keeps the width it needs. The face drops out on a
            repository's own page (see `showSource`): the head already names it,
            and 48 identical copies only crowd the names. A skill with no source
            at all states it in words instead, there being no face to stand for
            it. The classification lives on the leading glyph, so it is not
            repeated here. The figure takes a fixed right-aligned slot, sized
            to the format's longest rendering (four digits, a point, a suffix —
            "169.6K"): the digits then end on one edge at the row's far right,
            where magnitudes are compared, and the face left of it sits in a
            column of its own instead of drifting with the digits' width. */}
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          {showSource && owner && (
            <OwnerAvatar
              owner={owner}
              className="size-5 shrink-0 text-[9px]"
            />
          )}
          {/* A source-less row: the extra owns the label (text + icon merged
              into one trigger, or a plain statement with no candidates). */}
          {showSource && !owner
            ? extra ?? <span className="truncate">{t("common.localInstall")}</span>
            : extra}
          {storeBacked && (
            <SkillInstalls skill={skill} className="w-16 justify-end" />
          )}
        </div>

        {/* The corner action. Clicks on the slot stop here: the row body opens
            the detail panel, the action must not. The installed list hands over
            the enable switch; the store's rows keep the install button. */}
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {action ?? <SkillInstallButton skill={skill} />}
        </div>
      </Card>
    </li>
  );
}
