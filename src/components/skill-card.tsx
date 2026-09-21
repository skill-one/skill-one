import type { ReactNode } from "react";

import { LOCAL_SOURCE_LABEL, type SkillView } from "../lib/skill-view";
import { cn } from "../lib/utils";
import { DomainBadge } from "./domain-badge";
import { HighlightedText, type SkillMatched } from "./highlighted-text";
import { RepoHoverCard } from "./repo-hover-card";
import { SkillCover } from "./skill-cover";
import { SkillPopularity } from "./skill-popularity";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";

export type { SkillMatched };

/**
 * The lift and ring an interactive card gets on hover and focus, shared so the
 * store and the installed list cannot animate differently.
 */
const INTERACTIVE_CLASS =
  "cursor-pointer transition-all duration-150 hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * One skill, as a card — the single shape every skill surface uses: the store's
 * lists, a leaderboard, and the installed list.
 *
 * The card is read top to bottom in the order a reader actually decides in:
 * *what is it* (the name), *who published it* (the source line), *what does it
 * do* (the description), and only then *how popular is it* (the rail). Each of
 * One skill, as a card — the single shape every skill surface uses: the store's
 * lists, a leaderboard, and the installed list.
 *
 * The card is read top to bottom in the order a reader actually decides in:
 * *what is it* (the name), *who published it* (the source line), *what does it
 * do* (the description), and only then *how popular is it* (the rail). Each of
 * those three blocks has exactly one job:
 *
 * - **Header** — the skill's own cover, then the name with the source line
 *   pinned under it. The source is *always* drawn, which is what makes the
 *   block read as two lines instead of a name floating in whitespace: it is the
 *   one fact that tells `anthropics/skills` apart from an unknown repository,
 *   and it is a fact the ledger can vouch for even when the registry holds no
 *   entry for the skill. A skill with no recorded source has no repository to
 *   name, so the line says 本地安装 instead, with the migration badge trailing
 *   it.
 * - **Content** — the description: the only thing on the card that explains
 *   what the skill is *for*, so it is the widest text block, kept at two lines
 *   so cards in a row stay the same height.
 * - **Footer** — one quiet rail under a hairline: the classification on the
 *   left, the popularity figure on the right, both set in the same voice. A
 *   skill with neither (an install the registry cannot back) gets no rail at
 *   all: an empty hairline reads as a rendering bug, not as "no data".
 *
 * The cover is decoration and is sized like it: 48px, enough to give the grid
 * colour and a per-skill anchor, not enough to pretend the dataset's
 * illustration can be read at card size. Everything the card shows is read off
 * the skill, so feeding it a store row and feeding it an installed row produce
 * the same card. The two are told apart by data, not by a flag: a skill whose
 * registry entry is unknown (`storeBacked`) has no classification and no figure
 * to show rather than a fabricated zero — which is exactly what an installed
 * skill with no recorded source is.
 *
 * Only what a surface *does* arrives as a slot, because only the surface knows
 * it: the corner action (an install button on the store, an enable switch on the
 * installed list), a badge trailing the source line (the migration affordance),
 * and anything below the card (an install failure). The card body opens the
 * detail panel (`onSelect`) when the surface passes one; without it the card is
 * not a button at all. Clicks inside the corner stop there — the card body opens
 * the panel, the action must not.
 */
export function SkillCard({
  skill,
  matched,
  muted = false,
  selected = false,
  onSelect,
  action,
  sourceExtra,
  below,
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
  /** Trails the source line: the migration badge on an unlinked install. */
  sourceExtra?: ReactNode;
  /** Rendered under the card: an install failure, a dialog trigger. */
  below?: ReactNode;
  /** Test hook on the card element. */
  "data-skill"?: string;
}) {
  // Absent means backed: every `Skill` the registry handed over is. Only the
  // installed list sets it, for a record no store entry was resolved for.
  const storeBacked = skill.storeBacked !== false;
  // The owner segment of the source — what the dataset hosts an avatar for. A
  // bare owner (no slash) counts as none, exactly as it does for the cover.
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
          {/* Cover, then the name over its source — the one shape that gives
              the cover its place without letting it push the title around.
              `min-w-0` is what lets the stack shrink: the header is a grid and
              a `1fr` track keeps a content-based minimum, so a long name
              widened the track past the card and pushed the corner action out
              of it — the action hanging outside the border, the name
              untruncated, on any card whose name did not fit. Shrinking lets
              the name truncate instead, which is what the `truncate` on it is
              there for. */}
          <div className="flex min-w-0 items-start gap-3">
            <SkillCover
              repo={skill.repo}
              name={skill.name}
              className="size-12 shrink-0 text-lg"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {/* The name is the card's heading, so it stays an `h3` inside
                  the title slot rather than losing its meaning to a styled
                  `div`. 15px against the description's 13px is what makes the
                  two read as a title and a body at this size — at the app's
                  default 16px the hierarchy was thin enough that the block
                  read as one paragraph. */}
              <CardTitle>
                <h3
                  className={cn(
                    "truncate text-[15px] leading-tight",
                    muted && "text-muted-foreground",
                  )}
                >
                  <HighlightedText text={skill.name} terms={matched?.name} />
                </h3>
              </CardTitle>
              {/* The source, always present. On a sourced skill it is the
                  repository the rail's chip used to answer for on hover, and
                  the avatar rides it as the visual mark of *who* — the chip's
                  old home, the footer, was the least legible place on the card
                  for the second-most important fact on it, and it also left
                  the title block looking like a name with nothing under it. A
                  skill with no recorded source has nothing to hover, so there
                  the label, with the migration badge trailing it, is what
                  explains the empty source. */}
              <CardDescription
                className={cn(
                  "flex min-w-0 items-center gap-1.5 text-[11px]",
                  muted && "text-muted-foreground/70",
                )}
              >
                {owner ? (
                  <>
                    <RepoHoverCard
                      repo={skill.repo}
                      // A backless row carries 0 stars because there is no
                      // store entry to ask, not because the repo has none.
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
              </CardDescription>
            </div>
          </div>
          {/* The corner control. Clicks on the slot stop here: the card body
              opens the detail panel, the action must not. */}
          {action && (
            <CardAction onClick={(e) => e.stopPropagation()}>
              {action}
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="line-clamp-2 text-[13px] text-muted-foreground">
          <HighlightedText
            text={skill.description || "暂无描述"}
            terms={matched?.description}
          />
        </CardContent>

        {/* Pinned to the card's bottom edge: descriptions differ in length, and
            the two ends should still line up across a row. One rail, one voice:
            the classification on the left, the figure on the right, both plain
            text under a hairline — the bordered chip and the gradient flame
            that used to share it were the two loudest pieces of chrome on the
            card, and the figure they framed is the least important fact on it.
            A backless skill has neither to show, and closing the rail up is
            what keeps *that* readable: an empty rail under a hairline reads as
            a rendering bug. */}
        {(storeBacked || domain?.length) && (
          <CardFooter className="mt-auto gap-2 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
            {domain && domain.length > 0 && (
              <DomainBadge
                domain={domain}
                reason={skill.profile?.reason}
                // Flattened to plain text: the rail is a line of facts, not a
                // row of badges, so the chip keeps only its emoji, its name and
                // its tooltip.
                variant="ghost"
                className="px-0 py-0 font-normal"
              />
            )}
            {storeBacked && (
              <SkillPopularity
                skill={skill}
                side="top"
                align="end"
                className="ml-auto"
              />
            )}
          </CardFooter>
        )}
      </Card>

      {below}
    </li>
  );
}
