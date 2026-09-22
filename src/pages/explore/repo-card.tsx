import { Link } from "react-router";
import { ChevronRight, ExternalLink, Star } from "lucide-react";

import { domainMeta } from "../../data/domains";
import { openExternal } from "../../lib/open-external";
import type { SearchHit } from "../../lib/registry/protocol";
import { skillKey } from "../../lib/skill-view";
import { cn, formatCount } from "../../lib/utils";
import { HighlightedText } from "../../components/highlighted-text";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "../../components/skill-install-button";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "../../components/ui/card";

/**
 * How many of a repository's skills the card lists before the tail takes over.
 *
 * The card's height is what this number bounds: a repository with one skill and
 * a repository with fifty have to read as the same kind of object, so the list
 * grows with the repository only up to a point and then stops — past the cap the
 * tail states how much is left and hands the reader to the repository page.
 * Four measures 92px for a one-skill repository and 215px at the cap, so the
 * two extremes stay within a 2.4:1 band — which is what a lane of cards remains
 * scannable at.
 */
const PREVIEWED_SKILLS = 4;

/**
 * One repository, as one card — the store's repository view.
 *
 * The card is a repository with its skills inside it, and it is read as one:
 * the head says *which repository* (owner avatar, `owner/repo`, the stars and
 * how many skills it holds), the body lists its skills — most-installed first,
 * the repository's own leaders — and the tail, when there are more than the cap,
 * says how many are left.
 *
 * Three destinations, at the three granularities a reader chooses at:
 *
 * - the head (and the tail's 全部) opens the **repository page**, which lists
 *   every skill the repository publishes, uncapped;
 * - a **row** opens that skill's detail panel — the reader was pointing at one
 *   skill, and that is where its SKILL.md, its classification and its install
 *   state live;
 * - the row's own **install button** installs without either: the one action
 *   worth a click inside a list. It is a sibling of the row button rather than a
 *   child, so the two never nest and the button stops its own clicks from
 *   reaching the row.
 *
 * The body is the same for every repository, including the ones with a single
 * skill: one row per skill, never a promoted or specially-shaped first entry, so
 * nothing about the card's anatomy depends on how many skills happen to be in
 * it. What varies is only the number of rows, which is why the two extremes
 * still read as the same object.
 *
 * `hasQuery` is the one thing a search changes: a repository's rows are then
 * *matches*, and hiding a match behind the cap would defeat the search, so the
 * list stops capping itself while a query is live. Leaving the cap off for a
 * category — never for one skill — is the whole of what the query does here.
 *
 * The selected row (the skill in the detail panel) is marked in place. A skill
 * past the cap cannot be marked — it has no row to mark — which is a fact about
 * the panel's prev/next walk rather than something the card can fix: the panel
 * is the reader's position, the card only echoes it.
 */
export function RepoCard({
  repo,
  stars,
  skills,
  hasQuery = false,
  selected = null,
  onOpenSkill,
}: {
  /** `owner/repo` — the repository the card stands for. */
  repo: string;
  /** The repository's GitHub stars, when the grouping knows them. */
  stars?: number;
  /** The repository's skills, in the order the grouping produced (most
   *  installed first). */
  skills: SearchHit[];
  /** Whether a search is live; see the note above about the cap. */
  hasQuery?: boolean;
  /** `skillKey` of the skill in the detail panel, when one is open. */
  selected?: string | null;
  /** Opens one skill's detail panel. */
  onOpenSkill: (key: string) => void;
}) {
  // The owner segment is what the dataset hosts an avatar for; a repository
  // group always has one (a bare-host source is its own owner).
  const [owner] = repo.split("/");
  const shown = hasQuery ? skills : skills.slice(0, PREVIEWED_SKILLS);
  const hidden = skills.length - shown.length;
  const href = `/repo/${repo}`;
  const count = `${skills.length} 个 skill`;

  return (
    <li className="flex flex-col">
      {/* `flex-1` is the one thing the card cannot know: under the plain-grid
          fallback the lane's items are stretched to the tallest card in the
          row, and the card is what fills that height. */}
      <Card size="sm" data-repo={repo} className="group flex-1">
        <CardHeader>
          {/* The head is the repository page's door: the owner's avatar, the
              repository's name and its figures, one link. The count is spelled
              into the link's own name so assistive tech hears what the row of
              figures says without them being read as part of a repository
              name. */}
          <div className="flex min-w-0 items-center gap-1">
            <Link
              to={href}
              aria-label={`打开仓库 ${repo}，${count}`}
              className="group/head flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <OwnerAvatar owner={owner} className="size-5 shrink-0 text-[10px]" />
              <span className="truncate text-sm font-medium group-hover/head:underline">
                {repo}
              </span>
              {/* The figures the ordering used, pinned to the head's far edge:
                  the stars, then the skill count — the same pair a repository
                  group's header used to carry. */}
              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                {stars !== undefined && (
                  <span className="flex items-center gap-1">
                    <Star
                      className="h-3 w-3 fill-amber-400 text-amber-400"
                      aria-hidden
                    />
                    {formatCount(stars)}
                    <span aria-hidden="true">·</span>
                  </span>
                )}
                <span>{skills.length} 个</span>
              </span>
            </Link>
            {/* Leaving the app for the source is a repository-level action too,
                but a different destination than the page, so it is its own
                control rather than part of the link. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`在 GitHub 打开 ${repo}`}
              onClick={() => void openExternal(`https://github.com/${repo}`)}
              className="shrink-0 text-muted-foreground"
            >
              <ExternalLink />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* A row is the unit of the body, and it is deliberately not a card:
              the repository is the card, and a skill inside it is one line of
              its content. The horizontal bleed lets the hover highlight read as
              a row band rather than as a box inside the card's padding. */}
          <ul className="-mx-1.5 flex flex-col">
            {shown.map(({ skill, matched }) => {
              const key = skillKey(skill);
              const domain = skill.profile?.domain[0];
              const emoji = domain ? domainMeta(domain)?.emoji : undefined;
              const isSelected = selected != null && selected === key;
              return (
                <li
                  key={key}
                  className="group/row flex items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-accent/50 focus-within:bg-accent/50"
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
                      "flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left focus-visible:outline-none",
                      isSelected && "text-primary",
                    )}
                  >
                    {/* The classification's glyph, in a fixed slot so the names
                        of classified and unclassified skills still line up. */}
                    <span
                      aria-hidden="true"
                      className="w-4 shrink-0 text-center text-[12px]"
                    >
                      {emoji}
                    </span>
                    {/* The name is the identifier — it may not be truncated
                        into nothing by a long description, so it shrinks only up
                        to half the row; the description takes what is left. */}
                    <span className="max-w-[55%] shrink-0 truncate text-[13px] font-medium">
                      <HighlightedText text={skill.name} terms={matched?.name} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {skill.description}
                    </span>
                  </button>
                  <SkillInstallButton skill={skill} className="h-7 w-7" />
                </li>
              );
            })}
          </ul>
        </CardContent>

        {/* The cap's ledger, under a hairline like every card's rail, and
            `mt-auto` like one: a card whose list is shorter than its
            neighbour's still ends its rows at the same line on the card's
            bottom edge. */}
        {hidden > 0 && (
          <CardFooter className="mt-auto border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
            <span>还有 {hidden} 个 skill</span>
            <Link
              to={href}
              aria-label={`查看仓库 ${repo} 的全部 ${skills.length} 个 skill`}
              className="ml-auto flex items-center gap-0.5 font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              全部
              <ChevronRight className="h-3 w-3" aria-hidden />
            </Link>
          </CardFooter>
        )}
      </Card>
    </li>
  );
}
