import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Star } from "lucide-react";

import { useAppLocale } from "../../i18n/use-language";
import { skillDescription } from "../../lib/i18n-content";
import { domainIcon } from "../../data/domains";
import { DomainGlyph } from "../../components/domain-glyph";
import { DEFAULT_REPO_CARD_LIMIT } from "../../lib/repo-card-preview";
import {
  isLiveSkill,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import { cn, formatCount } from "../../lib/utils";
import {
  HighlightedText,
  type SkillMatched,
} from "../../components/highlighted-text";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "../../components/skill-install-button";
import { Card, CardContent, CardFooter } from "../../components/ui/card";

/**
 * One row of a repository card: a skill, plus whatever its surface adds to it.
 *
 * The store hands over plain search hits — a skill and the terms to highlight —
 * and the installed list hands over the same shape with the one fact only it
 * knows: whether the skill is enabled (a disabled row is dimmed), plus the
 * migration badge for an install whose source the ledger cannot vouch for. The
 * row's corner control is the store's install button; the installed list draws
 * no per-row control at all — a card manages its skills as one group, from the
 * bar (`footerAction`), and per-skill switching waits one level deeper, on the
 * repository's own page.
 */
export interface RepoCardRow {
  /** The skill the row renders. */
  skill: SkillView;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  /** Dimmed presentation: an installed skill that is disabled. */
  muted?: boolean;
  /** Beside the row button: the migration badge. */
  extra?: ReactNode;
  /** The row's own corner control; absent means the store's install button.
   *  Only rendered when the card's `rowActions` are on. */
  action?: ReactNode;
}

/**
 * One repository, as one card — the store's repository view, and the installed
 * list's unit too: the same card, whose bar carries a one-shot switch over the
 * card's skills instead of the rows carrying one switch each (see
 * `RepoEnableSwitch`).
 *
 * The card is a repository with its skills inside it, and it is read skills
 * first: the body lists them (most-installed first, the repository's own
 * leaders), and the single bar along the bottom signs the card while being the
 * door to the repository's page. The bar reads left to right as two clusters,
 * split by what each fact is *about*: the repository — avatar, `owner/repo`, its
 * star count — and then, at the far end, the way into its page, labelled with
 * the total skill count that page holds. Everything in the left cluster answers
 * "which repository is this", everything in the right one answers "how do I see
 * all of it", and the count sits inside the door's own phrase (「12 个 skill」)
 * rather than beside it, because the count is the door's object, not a second
 * fact next to it. Keeping the identity at the *bottom* is what makes the
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
 * - the **bottom bar** opens the repository's page: uncapped, and read the way
 *   the list it was opened from reads that repository — the store's page lists
 *   everything the repository publishes, the installed list's opens on the
 *   skills of it that are on disk, the rest of the catalogue one control away
 *   from there (see `RepoPage`). A card with skills left over says so by
 *   carrying the count its own list knows inside the door's own label.
 *
 * The bar is the card's only repository-level control, and it deliberately does
 * not carry an "open on GitHub" button. That button is a second link for the
 * same granularity of choice, pointing somewhere the bar's own page already
 * offers with a label ("在 GitHub 打开") — and it is 28px tall, which is what the
 * whole bar was as tall as: removing it is what makes the bar a line of text
 * rather than a line of text beside a button. The source is still two clicks
 * away (a row's panel links to it, and the repository page has the labeled
 * button), while the list itself stays one target per card. The one companion
 * the bar admits is `footerAction` — the installed list's one-shot switch over
 * the card's skills, a sibling of the door rather than a child of it: a press
 * on the switch must never also walk through the door.
 *
 * The store rows' **install button** is the third destination: it installs
 * without either. It is a sibling of the row button rather than a child, so the
 * two never nest and the button stops its own clicks from reaching the row; and
 * it is *revealed* on hover (or when the row is focused) rather than always
 * drawn. A card's worth of always-on buttons would be the loudest thing in the
 * grid — the repository view exists to compare skills, and the action is one
 * hover away from the skill it applies to. The one state that ignores that rule
 * is 已安装: an installed badge is a fact rather than an invitation, so it stays
 * drawn without the pointer and a reader scanning a lane sees at a glance which
 * skills they already have. This is where the card deliberately parts with the
 * standalone skill card, whose idle install button stays visible: there, one
 * card carries one skill, so the button is that card's own action rather than a
 * repeated glyph. A pointer that never hovers (a touch surface) still reaches
 * the same install through the detail panel, which the row opens. The installed
 * list asks for no row control at all (`rowActions={false}`): comparing and
 * grouping installed skills is what its cards are for, and enablement is one
 * group action on the bar until the reader deliberately enters the repository.
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
 * The body is the same for every repository, including the ones with a single
 * skill: one row per skill, never a promoted or specially-shaped first entry, so
 * nothing about the card's anatomy depends on how many skills happen to be in
 * it. What varies is only the number of rows, which is why the two extremes
 * still read as the same object.
 *
 * `hasQuery` is the one thing a search changes: a repository's rows are then
 * *matches*, and hiding a match behind the cap would defeat the search, so the
 * list stops capping itself while a query is live — leaving the cap off is the
 * whole of what the query does here.
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
  maxSkills = DEFAULT_REPO_CARD_LIMIT,
  hasQuery = false,
  selected = null,
  onOpenSkill,
  rowActions = true,
  hoverAction = true,
  footerAction,
  href,
}: {
  /** `owner/repo` — the repository the card stands for; empty for the installed
   *  list's pool of skills no recorded source vouches for. */
  repo: string;
  /** The repository's GitHub stars, when the grouping knows them. */
  stars?: number;
  /** The repository's rows, in the order the grouping produced (most
   *  installed first). */
  skills: RepoCardRow[];
  /**
   * How many of the repository's skills to list before the footer's door is the
   * only way to the rest — the reader's own choice, set in Settings (see
   * `lib/repo-card-preview`). The figure bounds the card's height: a repository
   * with one skill and one with fifty have to read as the same kind of object,
   * so the list grows with the repository only up to a point and then stops —
   * the footer always states the repository's total, so a capped list reads as
   * "these of them" rather than as "all of them".
   */
  maxSkills?: number;
  /** Whether a search is live; see the note above about the cap. */
  hasQuery?: boolean;
  /** `skillKey` of the skill in the detail panel, when one is open. */
  selected?: string | null;
  /** Opens one skill's detail panel. */
  onOpenSkill: (key: string) => void;
  /**
   * Whether the rows carry their corner control (the store's hover-revealed
   * install button). The installed list passes `false`: its cards carry no
   * per-skill control — the group switch on the bar and the per-skill switches
   * on the repository's page split that job.
   */
  rowActions?: boolean;
  /**
   * When rows do carry a corner control, whether it waits for the pointer (the
   * store's hover-revealed install button) or is drawn always (an explicit
   * per-row action the caller hands over, such as an enable switch).
   */
  hoverAction?: boolean;
  /**
   * A control at the bar's far end, a sibling of the door rather than a child
   * of it. The installed list hands over the one-shot enable switch over the
   * card's skills; absent (the store) leaves the bar one unbroken door.
   */
  footerAction?: ReactNode;
  /**
   * Where the bar leads. Absent means the repository's own page
   * (`/repo/owner/repo`, the store's full catalogue of it); the installed list
   * hands over its own reading of the same repository instead
   * (`/my-skills/repo/owner/repo`, the installs on disk); `null` makes the bar
   * a label rather than a door — for a listing that already is the whole thing
   * and has nowhere further to go.
   */
  href?: string | null;
}) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  // The owner segment is what the dataset hosts an avatar for; a repository
  // group always has one (a bare-host source is its own owner).
  const [owner] = repo.split("/");
  const shown = hasQuery ? skills : skills.slice(0, maxSkills);
  // The bar's own name: the repository when there is one, and the label for the
  // installed list's pool of skills no source vouches for when there is not.
  const name = repo || t("common.localInstall");
  // The door's destination; `null` leaves the bar a label (see `href`).
  const door = href === undefined ? `/repo/${repo}` : href;
  // A live skills.sh source has no in-app page: its door is an external URL
  // that opens in the system browser.
  const externalDoor = door != null && door.startsWith("http");
  // The door bar's content: who published this, and how many skills the card
  // lists.
  const doorBar = (
    <>
      {/* The identity is a size step above the rows: a 24px face and a
          14px name against the rows' 13px names and 13px glyphs. The bar
          sits under a hairline at the bottom of the card, so the step is
          what stops it from reading as one more row of the list. A pool
          of source-less installs has no owner to draw, so its name leads
          the bar alone. */}
      {repo ? (
        <OwnerAvatar owner={owner} className="size-6 shrink-0 text-[11px]" />
      ) : null}
      <span className="truncate text-sm font-semibold text-foreground group-hover/head:underline">
        {name}
      </span>
      {/* The repository's weight rides its name, because that is what the
          figure is about: a fact about the repository, next to the
          repository, the way a follower count sits next to an account.
          It used to sit out in the right-hand cluster with the count and
          the door, which mixed two different kinds of fact on one side of
          the bar — and it was never aligned there anyway: the digits are
          as wide as they are, so only the glyphs looked like a column.
          The amber star is separator enough; a `·` after it punctuated a
          group that had already ended. The raw figure stays reachable as
          the title, since the printed one is compacted. */}
      {stars !== undefined && (
        <span
          className="flex shrink-0 items-center gap-1 tabular-nums"
          title={`${stars} stars`}
        >
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
          {formatCount(stars)}
        </span>
      )}
      {/* The door, labelled with what it opens: the count is the door's
          *object*, so it is written inside the door's own phrase rather
          than standing beside it as a second figure with a separator
          between them — one phrase, one entity, and no bare 「N 个」 for
          the reader to disambiguate against the rows on screen. The noun
          comes from the app's own voice (`N 个 skill`, the same words the
          bar's own accessible name and the repository page's header use),
          which is also what settles 全部: 「全部 1 个」 reads badly for a
          repository with one skill, while 「1 个 skill」 reads the same as
          every other count. The chevron carries the "go" the way every
          other deeper affordance in the app does, and the total is always
          the repository's own — which is what lets a capped list read as
          "these of them": the reader counts the rows on screen and compares. */}
      <span className="ml-auto flex shrink-0 items-center gap-0.5 font-medium text-foreground tabular-nums">
        {t("state.skillCount", { count: skills.length })}
        <ChevronRight
          className="h-3 w-3 transition-transform group-hover/head:translate-x-0.5"
          aria-hidden
        />
      </span>
    </>
  );

  return (
    <li className="flex flex-col">
      {/* `flex-1` is the one thing the card cannot know: under the plain-grid
          fallback the lane's items are stretched to the tallest card in the
          row, and the card is what fills that height. */}
      <Card size="sm" data-repo={repo} className="group flex-1">
        <CardContent>
          {/* A row is the unit of the body, and it is deliberately not a card:
              the repository is the card, and a skill inside it is one line of
              its content. The horizontal bleed lets the hover highlight read as
              a row band rather than as a box inside the card's padding. */}
          <ul className="-mx-1.5 flex flex-col">
            {shown.map(({ skill, matched, muted, extra, action }) => {
              const key = skillKey(skill);
              // A live skills.sh row claims only what its source carries —
              // which is no description and no classification at all — so it
              // draws neither the 暂无描述 placeholder nor the help mark (see
              // `isLiveSkill`); an installed row the store cannot resolve is a
              // local fact, and keeps both.
              const live = isLiveSkill(skill);
              const isSelected = selected != null && selected === key;
              // The caller's own row control, else the store's install button.
              // Either one only renders when this card carries row actions at
              // all (`rowActions={false}` leaves the bar's group switch the
              // one control).
              const control = action ?? (
                <SkillInstallButton skill={skill} className="h-7 w-7" />
              );
              return (
                <li
                  key={key}
                  data-skill={skill.name}
                  className={cn(
                    "group/row relative flex items-center rounded-md px-1.5 transition-colors hover:bg-accent focus-within:bg-accent",
                    muted && "opacity-60",
                  )}
                >
                  {/* The row's clickable area is the skill itself; the install
                      button beside it is a sibling, so a row is never a button
                      inside a button. */}
                  <button
                    type="button"
                    onClick={() => onOpenSkill(key)}
                    aria-label={t("common.viewDetailAria", { name: skill.name })}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none",
                      isSelected && "text-primary",
                    )}
                  >
                    {/* The classification's glyph, in a fixed slot so the names
                        line up whether the skill is classified or not: mixed
                        shapes for the dataset's own 其他, the help icon for a
                        skill nothing classified — the same mark the list rows
                        wear (see `domainIcon`). A live row draws nothing in the
                        slot, which stays fixed so the names still line up. */}
                    <span
                      aria-hidden="true"
                      className="flex w-4 shrink-0 items-center justify-center text-muted-foreground"
                    >
                      {!live && (
                        <DomainGlyph
                          icon={domainIcon(skill.profile?.domain)}
                          className="size-3.5"
                        />
                      )}
                    </span>
                    {/* The name is the identifier and the row's one strong
                        element — semibold where the description is plain — and
                        it shrinks only up to half the row, so a long
                        description can never truncate it away. */}
                    <span className="max-w-[55%] shrink-0 truncate text-[13px] font-semibold">
                      <HighlightedText
                        text={skill.name}
                        terms={matched?.name}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {live
                        ? null
                        : skillDescription(skill, locale) || t("common.noDescription")}
                    </span>
                  </button>
                  {/* The row's own additions sit beside the row button rather
                      than inside it: a control nested in a control is invalid,
                      and a click must never mean both. */}
                  {extra}
                  {/* The installed list's rows carry no corner control: the
                      group switch on the bar owns enablement, and an
                      individual switch waits on the repository's own page. */}
                  {rowActions ? (
                    hoverAction ? (
                      /* Floating, not laid out: the button is absolutely placed
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
                      win, drawing the button the reader did not ask for. A
                      button that carries a state instead of an invitation —
                      installed above all — is what the `has-data` rule keeps on
                      screen; it reads the button's own `data-state`, so this
                      wrapper never has to know the state itself. */
                      <span className="absolute top-1/2 right-1 flex -translate-y-1/2 rounded-md bg-gradient-to-l from-accent via-accent to-transparent pl-6 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-data-[state=installed]:opacity-100">
                        {control}
                      </span>
                    ) : (
                      /* A fact rather than an invitation — drawn always, in
                      normal flow (the installed list's per-row switch used to
                      live here; now a caller that still wants a per-row control
                      hands it over explicitly). */
                      <span className="ml-1 flex shrink-0 items-center">
                        {control}
                      </span>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardContent>

        {/* The card's one bar: what this repository is, how big it is, and the
            way in. `mt-auto` keeps it on the bottom edge when the grid
            stretches a short card to its neighbour's height. An
            external door (a live source the store has no page for) opens in
            the system browser — the same bar, the same label, one step
            further out. */}
        <CardFooter className="mt-auto min-w-0 gap-2 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
          {door == null ? (
            /* A bar with nowhere to lead — the local pool's own page, which is
               already the whole list, or a live card whose rows are the whole
               answer — states the name and the total instead. The face rides
               the name whenever a repository stands behind it: a live card's
               owner is known (and the avatar resolves through the mirror, then
               GitHub's own endpoint — see `avatarCandidates`), while the local
               pool has no owner to draw. */
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {repo ? (
                <OwnerAvatar
                  owner={owner}
                  className="size-6 shrink-0 text-[11px]"
                />
              ) : null}
              <span className="truncate text-sm font-semibold text-foreground">
                {name}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-0.5 font-medium text-foreground tabular-nums">
                {t("state.skillCount", { count: skills.length })}
              </span>
            </span>
          ) : externalDoor ? (
            <a
              href={door}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                repo
                  ? t("state.viewRepoAria", {
                      repo,
                      count: skills.length,
                    })
                  : t("state.viewPoolAria", {
                      name,
                      count: skills.length,
                    })
              }
              className="group/head flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {doorBar}
            </a>
          ) : (
            <Link
              to={door}
              aria-label={
                repo
                  ? t("state.viewRepoAria", {
                      repo,
                      count: skills.length,
                    })
                  : t("state.viewPoolAria", {
                      name,
                      count: skills.length,
                    })
              }
              className="group/head flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {doorBar}
            </Link>
          )}
          {/* The bar's one companion control: a sibling of the door, never a
              child, so a press on it cannot also open the page. The installed
              list mounts the group switch here; the store mounts nothing. */}
          {footerAction && (
            <span className="flex shrink-0 items-center">{footerAction}</span>
          )}
        </CardFooter>
      </Card>
    </li>
  );
}
