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
 * A corner action that waits for attention: hidden until the reader reaches
 * the card — by pointer, or by keyboard (focusing the card or the action
 * itself counts) — while keeping its space, so the header never reflows and
 * the action stays in the accessibility tree. Touch surfaces have no hover,
 * so there the action simply stays visible.
 */
const ON_HOVER_ACTION_CLASS =
  "opacity-0 pointer-events-none transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

/**
 * One skill, as a card — the single shape every skill surface uses: the store's
 * lists, a leaderboard, and the installed list.
 *
 * The card is built on the shadcn Card so it is laid out by the component's own
 * slots rather than by hand: the header leads with the skill's own cover,
 * stacks the name — and the source, on a skill with no author chip to name it —
 * beside it and keeps the surface's action in the corner slot `CardAction`
 * exists for; the content holds the description, and the rail under it carries
 * the metadata — the author chip on the left, then the classification and the
 * popularity figure.
 *
 * Everything the card shows is read off the skill, so feeding it a store row and
 * feeding it an installed row produce the same card. The two are told apart by
 * data, not by a flag: a skill whose registry entry is unknown (`storeBacked`)
 * has no classification and no figure to show, and the rail closes up rather
 * than rendering a fabricated zero — which is exactly what an installed skill
 * with no recorded source is. The author chip survives that closure on its own:
 * it belongs to the source, which is a fact the ledger can vouch for even when
 * the registry holds no entry.
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
  actionVisibility = "always",
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
  /**
   * Whether the corner control is always shown, or only while the reader is
   * on the card. "on-hover" is for the quiet default of a surface — an idle
   * install button, a switch that is on; the states that need no attention.
   * States that do — installed, disabled, installing, failed — stay "always".
   */
  actionVisibility?: "always" | "on-hover";
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
  // The owner segment of the source — what the mirror hosts an avatar for. A
  // bare owner (no slash) counts as none, exactly as it does for the cover.
  const [owner] = skill.repo.split("/");

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
          {/* The card leads with the skill's own image, with its name and
              source stacked beside it — the one shape that gives the cover
              enough room to be recognisable. `min-w-0` is what lets that stack
              shrink: the header is a grid and a `1fr` track keeps a
              content-based minimum, so a long name widened the track past the
              card and pushed the corner action out of it — the action hanging
              outside the border, the name untruncated, on any card whose name
              did not fit. Shrinking lets the name truncate instead, which is
              what the `truncate` on it is there for. */}
          <div className="flex min-w-0 items-start gap-3">
            <SkillCover
              repo={skill.repo}
              name={skill.name}
              className="h-10 w-10 shrink-0 text-base"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {/* The name is the card's heading, so it stays an `h3` inside
                  the title slot rather than losing its meaning to a styled
                  `div`. */}
              <CardTitle>
                <h3 className={cn("truncate", muted && "text-muted-foreground")}>
                  <HighlightedText text={skill.name} terms={matched?.name} />
                </h3>
              </CardTitle>
              {/* The description slot carries the source, and only when the
                  card has no author chip to carry it: the rail's chip names
                  the repository and opens it on hover, so for a sourced skill
                  the line was the same fact twice. A skill with no recorded
                  source has no chip at all — nothing to hover — so there the
                  label, with the migration badge trailing it, is what explains
                  the empty source. The domain chip used to share this slot
                  too, which cost the source the chip's width (and let the chip
                  drift with the length of the repo name); it reads better in
                  the rail below next to the figure. */}
              {!owner && (
                <CardDescription
                  className={cn(
                    "flex items-center gap-1.5 truncate",
                    muted && "text-muted-foreground/70",
                  )}
                >
                  <span className="truncate">{LOCAL_SOURCE_LABEL}</span>
                  {sourceExtra}
                </CardDescription>
              )}
            </div>
          </div>
          {/* The corner control. Clicks on the slot stop here: the card body
              opens the detail panel, the action must not. */}
          {action && (
            <CardAction
              onClick={(e) => e.stopPropagation()}
              className={cn(actionVisibility === "on-hover" && ON_HOVER_ACTION_CLASS)}
            >
              {action}
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="line-clamp-2 text-sm text-muted-foreground">
          <HighlightedText
            text={skill.description || "暂无描述"}
            terms={matched?.description}
          />
        </CardContent>

        {/* Pinned to the card's bottom edge: descriptions differ in length, and
            the two ends should still line up across a row. The author chip
            opens the rail — *who* published it before *what* it is classified
            as and *how popular* it is — with classification on the left and
            the figure on the right under the corner action: the two rails the
            card is already read in, and the reason neither end is left
            floating in the middle. The chip keeps the rail alive on its own
            for a sourced install the registry no longer lists. */}
        {(storeBacked || owner) && (
          <CardFooter className="mt-auto gap-1.5">
            {owner && (
              <RepoHoverCard
                repo={skill.repo}
                // A backless row carries 0 stars because there is no store
                // entry to ask, not because the repo has none.
                stars={storeBacked ? skill.stars : undefined}
                className="h-4 w-4 text-[9px]"
              />
            )}
            {storeBacked && (
              <>
                {/* Domain from the profiles dataset; absent for skills it has
                    not profiled, so the figure simply keeps the right edge
                    alone. */}
                {skill.profile?.domain && (
                  <DomainBadge
                    domain={skill.profile.domain}
                    reason={skill.profile.reason}
                    className="shrink-0 rounded-full px-2 py-0 text-[10px] font-normal text-muted-foreground"
                  />
                )}
                <SkillPopularity
                  skill={skill}
                  side="top"
                  align="end"
                  className="ml-auto"
                />
              </>
            )}
          </CardFooter>
        )}
      </Card>

      {below}
    </li>
  );
}
