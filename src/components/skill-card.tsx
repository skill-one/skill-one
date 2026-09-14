import type { ReactNode } from "react";

import { LOCAL_SOURCE_LABEL } from "../lib/skill-view";
import { cn } from "../lib/utils";
import { HighlightedText, type SkillMatched } from "./highlighted-text";
import { SkillAvatar } from "./skill-avatar";
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
 * lists, a repo's skills, a leaderboard, and the installed list.
 *
 * The card is built on the shadcn Card so it is laid out by the component's own
 * slots rather than by hand: the header holds the avatar, name and source with
 * the surface's action in the corner slot `CardAction` exists for, the content
 * holds the description, and the footer holds whatever figures the surface
 * shows — classification on the left rail under the source it belongs to, the
 * figure on the right rail under the action.
 *
 * The card owns no surface-specific facts. Everything that genuinely differs
 * between the store and the installed list arrives as a slot: the corner action
 * (`action` — an install button there, an enable switch here), a badge trailing
 * the source line (`sourceExtra` — the migration affordance), the bottom rail
 * (`footer` — domain chip and popularity, which only a registry entry has), and
 * anything below the card (`below` — an install failure). What is genuinely the
 * same is derived here: the avatar (owner, or the placeholder when the source
 * is unknown, through `SkillAvatar`) and the source label (the repo, or the
 * local-install label). A surface that has nothing to put in a slot omits it,
 * and the card closes up around the gap.
 *
 * The card body opens the detail panel (`onSelect`) when the surface passes
 * one; without it the card is not a button at all. The action sits in the top
 * right corner, where the detail drawer keeps it too — and because the install
 * button carries state (安装 / 安装中 / 已安装 / 重试), a fixed corner turns the
 * grid's right edge into one column a reader can scan to see what they already
 * have. Clicks inside that corner stay there (the card body opens the panel,
 * the action must not).
 */
export function SkillCard({
  source,
  name,
  matched,
  description,
  muted = false,
  selected = false,
  onSelect,
  action,
  sourceExtra,
  footer,
  below,
  "data-skill": dataSkill,
}: {
  /** `owner/repo` the skill came from; absent renders the local placeholder. */
  source?: string;
  name: string;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  description: string;
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
  /** The bottom rail: domain chip and popularity, when the surface has them. */
  footer?: ReactNode;
  /** Rendered under the card: an install failure, a dialog trigger. */
  below?: ReactNode;
  /** Test hook on the card element. */
  "data-skill"?: string;
}) {
  return (
    <li className="flex flex-col">
      {/* `flex-1` is the one thing the card cannot know: it fills the grid cell
          so a short card's border still lines up with its taller neighbours. */}
      <Card
        data-skill={dataSkill}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? `查看 ${name} 详情` : undefined}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "flex-1",
          onSelect && INTERACTIVE_CLASS,
          muted && "opacity-60",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <CardHeader>
          {/* The name is the card's heading, so it stays an `h3` inside the
              title slot rather than losing its meaning to a styled `div`. */}
          <CardTitle className="flex items-center gap-2">
            <SkillAvatar
              source={source}
              className="h-6 w-6 text-[11px]"
              iconClassName="h-3.5 w-3.5"
            />
            <h3 className={cn("truncate", muted && "text-muted-foreground")}>
              <HighlightedText text={name} terms={matched?.name} />
            </h3>
          </CardTitle>
          {/* The description slot carries the source alone. The domain chip
              used to share it, which cost the source the chip's width (and let
              the chip's position drift with the length of the repo name);
              it reads better in the footer next to the figure. */}
          <CardDescription
            className={cn(
              "flex items-center gap-1.5 truncate",
              muted && "text-muted-foreground/70",
            )}
          >
            <span className="truncate">
              <HighlightedText
                text={source ?? LOCAL_SOURCE_LABEL}
                terms={matched?.repo}
              />
            </span>
            {sourceExtra}
          </CardDescription>
          {/* The corner control. Clicks on the slot stop here: the card body
              opens the detail panel, the action must not. */}
          {action && (
            <CardAction onClick={(e) => e.stopPropagation()}>
              {action}
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="line-clamp-2 text-sm text-muted-foreground">
          <HighlightedText
            text={description || "暂无描述"}
            terms={matched?.description}
          />
        </CardContent>

        {/* Pinned to the card's bottom edge: descriptions differ in length, and
            the two ends should still line up across a row. Classification on
            the left under the source it belongs to, the figure on the right
            under the corner action — the two rails the card is already read
            in, and the reason neither end is left floating in the middle. */}
        {footer && <CardFooter className="mt-auto">{footer}</CardFooter>}
      </Card>

      {below}
    </li>
  );
}
