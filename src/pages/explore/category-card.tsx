import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

import { domainDisplay } from "../../data/domains";
import type { SearchHit } from "../../lib/registry/protocol";
import { skillKey } from "../../lib/skill-view";
import { cn } from "../../lib/utils";
import { HighlightedText } from "../../components/highlighted-text";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "../../components/skill-install-button";
import { Card, CardContent, CardFooter } from "../../components/ui/card";

/**
 * How many of a category's skills the card lists before the footer's door is
 * the only way to the rest. Kept equal to `RepoCard`'s cap on purpose: the two
 * are the same kind of object at the same lane width, so a reader switching
 * views never has to re-learn how tall a card is.
 */
const PREVIEWED_SKILLS = 7;

/**
 * One category, as one card — the store's category view.
 *
 * It is the repository card's twin, one dimension over: the body lists the
 * category's skills (its most-installed ones, across every repository), and the
 * single bar along the bottom signs the card while being the door to the
 * category's own page. Two things change, both because the bucket is no longer
 * a repository:
 *
 * - the rows lead with the skill's **owner avatar** rather than its own
 *   classification glyph — inside a category the classification is the card
 *   itself, so the row's leading slot is free to answer the question the card
 *   cannot (who published this skill?), and a category gathers skills from many
 *   owners, so that face is genuinely new information on every row;
 * - the bar's identity is the category's **emoji**, where the repository bar
 *   wears the owner's avatar — the bucket is the category, so the bar shows the
 *   category, and its door leads to the category page.
 *
 * Everything else matches `RepoCard` line for line: the same cap, the same
 * install button revealed on hover (and kept on screen when installed), the
 * same `mt-auto` bar pinned to the bottom edge, the same count-in-the-door
 * phrase. The skills may come from any repository, so a row's own detail panel
 * is still where its source, classification and SKILL.md live.
 */
export function CategoryCard({
  domain,
  skills,
  hasQuery = false,
  selected = null,
  onOpenSkill,
}: {
  /** The domain key the card stands for (see `data/domains`). */
  domain: string;
  /** The category's skills, in the order the grouping produced (most
   *  installed first). */
  skills: SearchHit[];
  /** Whether a search is live; the list stops capping itself while one is. */
  hasQuery?: boolean;
  /** `skillKey` of the skill in the detail panel, when one is open. */
  selected?: string | null;
  /** Opens one skill's detail panel. */
  onOpenSkill: (key: string) => void;
}) {
  const meta = domainDisplay(domain);
  const shown = hasQuery ? skills : skills.slice(0, PREVIEWED_SKILLS);
  const href = `/explore/category/${domain}`;

  return (
    <li className="flex flex-col">
      {/* `flex-1` is the one thing the card cannot know: under the plain-grid
          fallback the lane's items are stretched to the tallest card in the
          row, and the card is what fills that height. */}
      <Card size="sm" data-category={domain} className="group flex-1">
        <CardContent>
          {/* A row is the unit of the body, and it is deliberately not a card:
              the category is the card, and a skill inside it is one line of its
              content. The horizontal bleed lets the hover highlight read as a
              row band rather than as a box inside the card's padding. */}
          <ul className="-mx-1.5 flex flex-col">
            {shown.map(({ skill, matched }) => {
              const key = skillKey(skill);
              const [owner] = skill.repo.split("/");
              const isSelected = selected != null && selected === key;
              return (
                <li
                  key={key}
                  className="group/row relative flex items-center rounded-md px-1.5 transition-colors hover:bg-accent focus-within:bg-accent"
                >
                  {/* The row's clickable area is the skill itself; the install
                      button beside it is a sibling, so a row is never a button
                      inside a button. */}
                  <button
                    type="button"
                    onClick={() => onOpenSkill(key)}
                    aria-label={`查看 ${skill.name} 详情`}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none",
                      isSelected && "text-primary",
                    )}
                  >
                    {/* The owner's face, in a fixed slot so the names of every
                        row still line up. It answers the one question the card
                        itself does not: who published this skill. */}
                    <OwnerAvatar
                      owner={owner}
                      className="size-4 shrink-0 text-[9px]"
                    />
                    {/* The name is the identifier and the row's one strong
                        element — semibold where the description is plain — and
                        it shrinks only up to half the row, so a long
                        description can never truncate it away. */}
                    <span className="max-w-[55%] shrink-0 truncate text-[13px] font-semibold">
                      <HighlightedText text={skill.name} terms={matched?.name} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {skill.description}
                    </span>
                  </button>
                  {/* Floating and revealed exactly as on the repository card:
                      hidden until the row is hovered or focused, but kept on
                      screen when the button carries a state (installed above
                      all) — the wrapper reads the button's own `data-state`. */}
                  <span className="absolute top-1/2 right-1 flex -translate-y-1/2 rounded-md bg-gradient-to-l from-accent via-accent to-transparent pl-6 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-data-[state=installed]:opacity-100">
                    <SkillInstallButton skill={skill} className="h-7 w-7" />
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>

        {/* The card's one bar: what this category is, how big it is, and the
            way in. `mt-auto` keeps it on the bottom edge when the plain-grid
            fallback stretches a short card to its neighbour's height. The
            identity is the category's emoji in the same size slot the
            repository bar gives the owner's avatar, so the two cards' bars
            still line up. */}
        <CardFooter className="mt-auto min-w-0 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
          <Link
            to={href}
            aria-label={`查看分类 ${meta.name}，${skills.length} 个 skill`}
            className="group/head flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[13px]"
            >
              {meta.emoji}
            </span>
            <span className="truncate text-sm font-semibold text-foreground group-hover/head:underline">
              {meta.name}
            </span>
            {/* The door, labelled with what it opens: the category's own page,
                which lists every skill in it, uncapped. The count is the door's
                object, written inside its own phrase rather than beside it —
                the same 「N 个 skill」 the repository bar uses, so a capped body
                reads as "these of them" either way. */}
            <span className="ml-auto flex shrink-0 items-center gap-0.5 font-medium text-foreground tabular-nums">
              {skills.length} 个 skill
              <ChevronRight
                className="h-3 w-3 transition-transform group-hover/head:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        </CardFooter>
      </Card>
    </li>
  );
}
