import type { ReactNode } from "react";

import { isLiveSkill, LOCAL_SOURCE_LABEL, type SkillView } from "../lib/skill-view";
import { cn } from "../lib/utils";
import { DomainBadge } from "./domain-badge";
import { HighlightedText, type SkillMatched } from "./highlighted-text";
import { RepoHoverCard } from "./repo-hover-card";
import { SkillInstalls } from "./skill-installs";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";

export type { SkillMatched };

/**
 * The lift and ring an interactive card gets on hover and focus, shared so the
 * store and the installed list cannot animate differently — and so a
 * collection page's list row (`SkillRow`) wears the same interaction as the
 * cards it sits among.
 */
export const INTERACTIVE_CLASS =
  "cursor-pointer transition-all duration-150 hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * One skill, as a card — the single shape every skill surface uses: the store's
 * lists, a leaderboard, and the installed list.
 *
 * Three blocks, read top to bottom in the order a reader actually decides in:
 * *what is it* (the name), *what does it do* (the description), and *the facts
 * about it* (the rail: where it came from, how it is classified, how installed
 * it is). Each block has exactly one job:
 *
 * - **Header** — the name alone, in the title slot, with the corner action
 *   beside it. It is the only block a reader scans across a row, so nothing
 *   else may share its line. (A cover image used to open the card; the dataset
 *   publishes no per-skill illustration, so it was always a placeholder letter
 *   square — 48px of chrome that pushed the name down and carried no fact. The
 *   provenance it gestured at is stated in words on the rail instead.)
 * - **Content** — the description: the only thing on the card that explains
 *   what the skill is *for*, kept at two lines so cards in a row stay the same
 *   height.
 * - **Footer** — one rail under a hairline, pinned to the card's bottom edge: the
 *   source on the left (the owner's avatar, then the repository it stands for),
 *   the classification after it, and the install figure pushed to the right.
 *   One voice for all three — plain text at 11px — because the rail is a line of
 *   facts, not a row of badges. The source belongs here rather than under the
 *   name: it is a fact *about* the skill, like its classification and its
 *   figure, and each of those is a lookup, not something the reader is choosing
 *   between. The rail is always drawn, since the source is always nameable — a
 *   skill with no recorded repository states 本地安装 (with the migration badge
 *   trailing it) exactly where it would otherwise name one.
 *
 * The card's density comes from that missing block: with the cover gone the
 * header is one line, so the whole card is `sm`-spaced (12px) and reads as a
 * title, a two-line summary and a rail.
 *
 * Everything the card shows is read off the skill, so feeding it a store row and
 * feeding it an installed row produce the same card. The two are told apart by
 * data, not by a flag: a skill whose registry entry is unknown (`storeBacked`)
 * has no classification and no figure to show rather than a fabricated zero —
 * which is exactly what an installed skill with no recorded source is, and what
 * a live skills.sh row is.
 *
 * Only what a surface *does* arrives as a slot, because only the surface knows
 * it: the corner action (an install button on the store, an enable switch on the
 * installed list) and a badge trailing the source (the migration affordance) —
 * where a failure is reported is the button's own business. The card body opens
 * the detail panel (`onSelect`) when the surface passes one; without it the card
 * is not a button at all. Clicks inside the corner stop there — the card body
 * opens the panel, the action must not.
 */
export function SkillCard({
  skill,
  matched,
  muted = false,
  selected = false,
  onSelect,
  action,
  sourceExtra,
  "data-skill": dataSkill,
}: {
  /** The skill to render, from the registry or from the installed list. */
  skill: SkillView;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  /** Dimmed presentation: a skill that is installed but disabled. */
  muted?: boolean;
  /** Whether this card is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel; without it the card is not a button. */
  onSelect?: () => void;
  /** The corner control: an install button on the store, a switch on the list. */
  action?: ReactNode;
  /** Trails the source on the rail: the migration badge on an unlinked install. */
  sourceExtra?: ReactNode;
  /** Test hook on the card element. */
  "data-skill"?: string;
}) {
  // Absent means backed: every `Skill` the registry handed over is. The two
  // callers that set it are the installed list, for a record no store entry was
  // resolved for, and the store's live skills.sh section, whose rows are not in
  // the index at all.
  const storeBacked = skill.storeBacked !== false;
  // The owner segment of the source — what the dataset hosts an avatar for, and
  // what the rail's chip stands for. Empty only when there is no source at all;
  // a bare-host source is its own owner.
  const [owner] = skill.repo.split("/");
  // Classification and figure are both registry facts; the dataset simply has
  // not classified every skill, so the classification is optional. A skill may
  // belong to several domains — the badge leads with the best-fitting one.
  const domain = skill.profile?.domain;

  return (
    <li className="flex flex-col">
      {/* `flex-1` is the one thing the card cannot know: it fills the grid cell
          so a short card's border still lines up with its taller neighbours. */}
      <Card
        size="sm"
        data-skill={dataSkill}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? `查看 ${skill.name} 详情` : undefined}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "group flex-1",
          onSelect && INTERACTIVE_CLASS,
          muted && "opacity-60",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <CardHeader>
          {/* The name is the card's heading, so it stays an `h3` inside the
              title slot rather than losing its meaning to a styled `div`. 15px
              against the description's 13px is what makes the two read as a
              title and a body at this size. `min-w-0` is what lets it truncate:
              the header is a grid and a `1fr` track keeps a content-based
              minimum, so a long name widened the track past the card and pushed
              the corner action out of it — the action hanging outside the
              border, the name untruncated, on any card whose name did not fit. */}
          <CardTitle className="min-w-0">
            <h3
              className={cn(
                "truncate text-[15px] leading-tight",
                muted && "text-muted-foreground",
              )}
            >
              <HighlightedText text={skill.name} terms={matched?.name} />
            </h3>
          </CardTitle>
          {/* The corner control. Clicks on the slot stop here: the card body
              opens the detail panel, the action must not. */}
          {action && (
            <CardAction onClick={(e) => e.stopPropagation()}>
              {action}
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {/* A live skills.sh row's source carries no description at all, so
              it claims none — no 暂无描述 standing in for a fact nobody
              established (see `isLiveSkill`). */}
          {isLiveSkill(skill) ? null : skill.description || "暂无描述"}
        </CardContent>

        {/* Pinned to the card's bottom edge (`mt-auto`): descriptions differ in
            length, and the two ends should still line up across a row. The
            source leads, because a name alone does not say who published it;
            the figure trails, because it is the derived number and the least
            important fact here. The repo is the one part that may truncate —
            every other fact on the rail is short and must stay whole. */}
        <CardFooter
          className={cn(
            "mt-auto min-w-0 gap-2 border-t border-border/60 pt-2.5 text-[11px]",
            muted ? "text-muted-foreground/70" : "text-muted-foreground",
          )}
        >
          {owner ? (
            <>
              <RepoHoverCard
                repo={skill.repo}
                // A backless row carries 0 stars because there is no store
                // entry to ask, not because the repo has none.
                stars={storeBacked ? skill.stars : undefined}
                className="size-4 text-[9px]"
              />
              <span className="truncate">{skill.repo}</span>
            </>
          ) : (
            <>
              <span className="truncate">{LOCAL_SOURCE_LABEL}</span>
              {sourceExtra}
            </>
          )}
          {domain && domain.length > 0 && (
            <DomainBadge
              domain={domain}
              // Flattened to plain text: the rail is a line of facts, not a
              // row of badges, so the chip keeps only its emoji, its name and
              // its tooltip — at the rail's own size, not the badge's.
              variant="ghost"
              className="px-0 py-0 text-[11px] font-normal"
            />
          )}
          {storeBacked && (
            <SkillInstalls skill={skill} className="ml-auto text-[11px]" />
          )}
        </CardFooter>
      </Card>
    </li>
  );
}
