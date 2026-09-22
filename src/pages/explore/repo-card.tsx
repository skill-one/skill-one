import type { CSSProperties } from "react";
import { Link } from "react-router";
import { ChevronRight, Star } from "lucide-react";

import { domainMeta } from "../../data/domains";
import { useOwnerTint } from "../../hooks/use-owner-tint";
import type { SearchHit } from "../../lib/registry/protocol";
import { skillKey } from "../../lib/skill-view";
import { cn, formatCount } from "../../lib/utils";
import { HighlightedText } from "../../components/highlighted-text";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "../../components/skill-install-button";
import { Card, CardContent, CardFooter } from "../../components/ui/card";

/**
 * How many of a repository's skills the card lists before the footer's door is
 * the only way to the rest.
 *
 * The card's height is what this number bounds: a repository with one skill and
 * a repository with fifty have to read as the same kind of object, so the list
 * grows with the repository only up to a point and then stops — the footer
 * always states how many skills the repository has in total, so a capped list
 * reads as "these of them" rather than as "all of them".
 * Four measures 98px for a one-skill repository and 177px at the cap, so the
 * two extremes stay within a 1.8:1 band — which is what a lane of cards remains
 * scannable at.
 */
const PREVIEWED_SKILLS = 4;

/**
 * One repository, as one card — the store's repository view.
 *
 * The card is a repository with its skills inside it, and it is read skills
 * first: the body lists them (most-installed first, the repository's own
 * leaders), and the single bar along the bottom signs the card — owner avatar,
 * `owner/repo`, the stars and the total skill count — while being the door to
 * the repository's page. Keeping the identity at the *bottom* is what makes the
 * skills the card's content instead of an attachment to a header: a card whose
 * first line is a repository name reads as a repository with a list under it,
 * and the reader who is comparing skills has to look past the name of every
 * card to reach the thing they are choosing between. It also merges what used
 * to be two bars — the header, and the tail whose only job was to lead to the
 * page — into the one line that has to exist anyway.
 *
 * Two destinations, at the two granularities a reader chooses at:
 *
 * - a **row** opens that skill's detail panel — the reader was pointing at one
 *   skill, and that is where its SKILL.md, its classification and its install
 *   state live;
 * - the **bottom bar** opens the repository's page, which lists every skill the
 *   repository publishes, uncapped. A card with skills left over says so by
 *   carrying the repository's full count next to the door.
 *
 * The bar is the card's only repository-level control, and it deliberately does
 * not carry an "open on GitHub" button. That button is a second link for the
 * same granularity of choice, pointing somewhere the bar's own page already
 * offers with a label ("在 GitHub 打开") — and it is 28px tall, which is what the
 * whole bar was as tall as: removing it is what makes the bar a line of text
 * rather than a line of text beside a button. The source is still two clicks
 * away (a row's panel links to it, and the repository page has the labeled
 * button), while the list itself stays one target per card.
 *
 * The row's **install button** is the third: it installs without either. It is
 * a sibling of the row button rather than a child, so the two never nest and
 * the button stops its own clicks from reaching the row; and it is *revealed* on
 * hover (or when the row is focused) rather than always drawn. Four always-on
 * buttons per card would be the loudest thing in the grid — the repository view
 * exists to compare skills, and the action is one hover away from the skill it
 * applies to. This is where the card deliberately parts with the standalone
 * skill card, whose idle install button stays visible: there, one card carries
 * one skill, so the button is that card's own action rather than a repeated
 * glyph. A pointer that never hovers (a touch surface) still reaches the same
 * install through the detail panel, which the row opens.
 *
 * Because the button is only ever *shown* on intent, it does not take part in
 * the row's layout: it floats over the row's right edge, so a name and a
 * description get the whole of the row's width in the state every row spends
 * nearly all of its time in — the state a reader compares skills in. The text it
 * floats over is dissolved by a gradient of the row's own hover surface rather
 * than cut off, so a description that runs under the button still reads as
 * continuing rather than as clipped. The row keeps its height either way, so
 * nothing moves under the pointer when the action arrives.
 *
 * The bar's identity is a deliberate size step above the rows — a 24px face and
 * a 14px name against the rows' 13px names and 13px glyphs. The bar sits under a
 * hairline at the card's bottom edge, and the step is what keeps it from reading
 * as one more row of the list it signs.
 *
 * The owner's avatar also gives the card its **tint**: the average colour of the
 * picture, read once per owner and mixed — a little — into the bar's wash and
 * the card's ring (see `lib/owner-tint.ts` and the `[data-owner-tint]` rule in
 * `index.css`). It is decoration on top of decoration, and it is built to be
 * droppable: the read is scheduled on idle, a card renders its plain chrome
 * first and gains the tint only if a colour arrives, and a card that never gets
 * one is indistinguishable from the card this component drew before the feature
 * existed.
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
  const href = `/repo/${repo}`;
  // The owner's colour, off their avatar. Null is the normal state — the read is
  // scheduled on idle and most cards paint before it lands — and it is also the
  // permanent state wherever there is nothing to read.
  const tint = useOwnerTint(owner);

  return (
    <li className="flex flex-col">
      {/* `flex-1` is the one thing the card cannot know: under the plain-grid
          fallback the lane's items are stretched to the tallest card in the
          row, and the card is what fills that height. The tint arrives as one
          custom property plus a marker attribute, which is what the two rules in
          `index.css` key off — the colour itself is never written into a class,
          so the shares that keep its contrast safe stay in the stylesheet. */}
      <Card
        size="sm"
        data-repo={repo}
        data-owner-tint={tint ? "" : undefined}
        style={tint ? ({ "--owner-tint": tint } as CSSProperties) : undefined}
        className="group flex-1"
      >
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
                    {/* The classification's glyph, in a fixed slot so the names
                        of classified and unclassified skills still line up. */}
                    <span
                      aria-hidden="true"
                      className="w-4 shrink-0 text-center text-[13px]"
                    >
                      {emoji}
                    </span>
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
                  {/* Floating, not laid out: the button is absolutely placed
                      over the row's right edge, so the name and the description
                      own the row's whole width and the reader sees more of them
                      in the state every row spends nearly all its time in. It
                      is revealed on hover and on focus (the row's or its own)
                      and floats over the text it makes room for, dissolving it
                      with a gradient of the row's own hover surface — the same
                      treatment the detail panel's clipped description uses. The
                      reveal sits on this wrapper rather than on the button
                      because the button already owns `opacity` for its own
                      states: `disabled:opacity-50` on an installed or installing
                      button is more specific than a bare `opacity-0` and would
                      win, drawing the button the reader did not ask for. */}
                  <span className="absolute top-1/2 right-1 flex -translate-y-1/2 rounded-md bg-gradient-to-l from-accent via-accent to-transparent pl-6 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                    <SkillInstallButton skill={skill} className="h-7 w-7" />
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>

        {/* The card's one bar: what this repository is, how big it is, and the
            way in. `mt-auto` keeps it on the bottom edge when the plain-grid
            fallback stretches a short card to its neighbour's height. The bar is
            where the owner's tint shows: `--card-bar` is the theme's own wash,
            and a card with a colour narrows it to that colour's hue (see
            `index.css`) — so this reads the same token either way. */}
        <CardFooter className="mt-auto min-w-0 border-t border-border/60 bg-(--card-bar) pt-2.5 text-[11px] text-muted-foreground">
          <Link
            to={href}
            aria-label={`查看仓库 ${repo}，${skills.length} 个 skill`}
            className="group/head flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {/* The identity is a size step above the rows: a 24px face and a
                14px name against the rows' 13px names and 13px glyphs. The bar
                sits under a hairline at the bottom of the card, so the step is
                what stops it from reading as one more row of the list. */}
            <OwnerAvatar owner={owner} className="size-6 shrink-0 text-[11px]" />
            <span className="truncate text-sm font-semibold text-foreground group-hover/head:underline">
              {repo}
            </span>
            {/* The repository's size and the figure it is ranked by, in the
                voice the rest of the app uses for them. The count is the
                repository's *total*: that is what tells a capped list apart
                from a complete one. The raw figure stays reachable as the
                title, since the printed one is compacted. */}
            <span className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums">
              {stars !== undefined && (
                <span
                  className="flex items-center gap-1"
                  title={`${stars} stars`}
                >
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
            {/* The door itself. The chevron leans into the hover the way every
                other "go deeper" affordance in the app does, and 全部 stays a
                word rather than becoming a bare arrow: it is the half of the
                bar's sentence that says what the click gets you. */}
            <span className="flex shrink-0 items-center gap-0.5 font-medium text-foreground">
              全部
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
