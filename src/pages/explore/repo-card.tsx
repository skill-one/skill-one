import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Star } from "lucide-react";

import { useAppLocale } from "../../i18n/use-language";
import { skillDescription } from "../../lib/i18n-content";
import { domainEmoji } from "../../data/domains";
import { DEFAULT_REPO_CARD_LIMIT } from "../../lib/repo-card-preview";
import {
  isInstallableSkill,
  isLiveSkill,
  skillDisplayName,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import type { Skill } from "../../types/skill";
import { cn, formatCount } from "../../lib/utils";

import {
  HighlightedText,
  type SkillMatched,
} from "../../components/highlighted-text";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "../../components/skill-install-button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";

/**
 * One shared transition for the expansion choreography — the card surface and
 * every text-bearing element inside it move on the same clock, so nothing
 * leads or lags.
 */
const EXPAND_TRANSITION = { duration: 0.25, ease: "easeOut" } as const;

/**
 * The card surface and its header as projection nodes. The surface is what
 * scales during the expansion — making it the projection node lets motion
 * correct the one thing that cannot survive scaling (the rounded corners,
 * which it reads from computed style); the header is position-only, so its
 * hairline divider keeps its one pixel instead of thinning with the scale.
 */
const MotionCard = motion.create(Card);
const MotionCardHeader = motion.create(CardHeader);

/**
 * One row of a repository card: a skill, plus whatever its surface adds to it.
 *
 * The store hands over plain search hits — a skill and the terms to highlight —
 * and the installed list hands over the same shape with the one fact only it
 * knows: whether the skill is enabled (a disabled row is dimmed), plus the
 * migration badge for an install whose source the ledger cannot vouch for. The
 * row's corner control is the store's install button; the installed list hands
 * over the skill's enable switch in the same slot — hover-revealed like the
 * install button, while the bar (`footerAction`) keeps the one group switch.
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
 * The card is a repository with its skills inside it, and the single bar along
 * the top names the card; the body under it lists the skills (most-installed
 * first, the repository's own leaders). The bar reads left to right as two
 * clusters, split by what each fact is *about*: the repository — avatar,
 * `owner/repo`, its star count — and then, on an expandable card, the offer
 * (「＋ 3」): a plus drawn as an icon over the exact number of rows a press
 * reveals. Everything in the left cluster answers "which repository is this",
 * the offer answers "what happens if I press", as one mark rather than as
 * arithmetic to parse. A card whose every row is already on screen shows no
 * figure at all. Leading with the identity is what makes a scan of the grid
 * read as a scan of repositories — one line per card answers "which one is
 * this" before any of its rows do — with the skills folded under the name they
 * belong to.
 *
 * Two controls, at the two granularities a reader chooses at:
 *
 * - a **row** opens that skill's detail panel — the reader was pointing at one
 *   skill, and that is where its SKILL.md, its classification and its install
 *   state live;
 * - the **top bar** expands the card in place when the cap is holding rows
 *   back (see below); on a card with nothing to reveal it is a plain label.
 *
 * **Expansion** answers the commonest question the card leaves open ("what
 * else is in here?") without leaving the list: a card whose cap is hiding rows
 * turns its bar into a toggle, and a press reveals every row in place — the
 * card spans the full grid row (`col-span-full`) and its body splits into two
 * balanced columns, so the reveal reads at the width of the list rather than of
 * one lane. Auto-placement drops an opened right-lane card at the next row
 * start, and the whole reflow — the card's glide into its new footprint, the
 * row-mates stepping aside — runs as one motion layout transition, so the
 * move reads as motion rather than as a teleport (and is skipped entirely for
 * readers who ask for reduced motion). A second press folds the card back. A
 * card with nothing behind its cap — or one under a live search, whose every
 * row is already on screen — keeps the bar as a plain label: a toggle is worth
 * a press only when it would reveal something. Under a search the wide
 * footprint is not a toggle's work at all: a card holding more rows than the
 * cap simply *is* open, and takes the full-row, two-column layout on its own.
 *
 * The bar is the card's only repository-level control, and it deliberately does
 * not carry an "open on GitHub" button or any route out of the list: the card
 * is the reading surface, the rows and the detail panel are where a choice
 * resolves, and a second destination for the same granularity of choice would
 * only compete with them. The one companion the bar admits is `footerAction` —
 * the installed list's one-shot switch over the card's skills, a sibling of the
 * toggle rather than a child of it: a press on the switch must never also fold
 * the card.
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
 * the same install through the detail panel, which the row opens. The
 * installed list puts its per-row enable switch in the same floating slot
 * (`hoverAction` with the switch as the row's `action`): enablement of one
 * skill is a point-in-time action like installing, while the bar's group
 * switch (`footerAction`) remains the control that answers "all of them".
 *
 * **Uninstalled siblings** — the optional `uninstalled` prop — give an
 * installed card its repository's missing skills. Folded, the offer is one
 * badge on the bar — 「1 个未安装」 — a status mark rather than a second row:
 * the card stays one line tall, and the count reads in the same scan that
 * reads the name and the stars. The bar itself is the toggle: a press unfolds
 * the uninstalled group in place — the same reveal the bar's 「＋ N」 makes
 * for the rows behind the cap — and on a card holding both, one press
 * reveals both, so the bar never means two different folds. Open, the group
 * reads as its own: a hairline, then the group's marker row (a minus over
 * the count, the fold's way back) before the rows begin, so the two lists
 * never read as one. An open group widens the card — the same full-row,
 * two-column footprint the bar's expansion takes, with the uninstalled rows
 * splitting into balanced columns like the installed ones — so the reveal
 * reads at the width of the list. The installed rows keep their order, the
 * uninstalled ones live below the divider, and a second press folds them all
 * back.
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
 * hairline at the card's top edge, and the step is what keeps it from reading as
 * one more row of the list it names.
 *
 * The body is the same for every repository, including the ones with a single
 * skill: one row per skill, never a promoted or specially-shaped first entry, so
 * nothing about the card's anatomy depends on how many skills happen to be in
 * it. What varies is only the number of rows, which is why the two extremes
 * still read as the same object.
 *
 * `hasQuery` is the one thing a search changes: a repository's rows are then
 * *matches*, and hiding a match behind the cap would defeat the search, so the
 * list stops capping itself while a query is live — every match is on screen.
 * But "uncapped" is not "narrow": a big repository would otherwise read as one
 * tall lane, so under a search the cap keeps a second job — it is the measure
 * of *big*. A card holding more rows than the cap takes the open card's own
 * footprint on its own (spanning the full grid row, body in two balanced
 * columns), with no toggle, because nothing is held back to reveal.
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
  uninstalled,
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
   * How many of the repository's skills to list before the bar's toggle is the
   * way to the rest — the reader's own choice, set in Settings (see
   * `lib/repo-card-preview`). The figure bounds the card's height: a repository
   * with one skill and one with fifty have to read as the same kind of object,
   * so the list grows with the repository only up to a point and then stops —
   * past it, the bar's plus figure states exactly how many rows a press adds.
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
   * install button, or whatever `action` the caller hands over — the installed
   * list's per-row enable switch). The bar's group switch stays the control
   * that answers "all of them at once" either way.
   */
  rowActions?: boolean;
  /**
   * When rows do carry a corner control, whether it waits for the pointer (the
   * store's hover-revealed install button) or is drawn always (an explicit
   * per-row action the caller hands over, such as an enable switch).
   */
  hoverAction?: boolean;
  /**
   * A control at the bar's far end, a sibling of the bar rather than a child
   * of it. The installed list hands over the one-shot enable switch over the
   * card's skills; absent (the store) leaves the bar alone with its toggle.
   */
  footerAction?: ReactNode;
  /**
   * The repository's registry skills that are not installed — the installed
   * list's offer, folded under the card's rows until asked for. Absent (the
   * store, whose rows *are* the repository) draws no section at all.
   */
  uninstalled?: Skill[];
}) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  // Expansion is the card's own fact: a press on the bar reveals the rows the
  // cap is holding back, right where the card stands, instead of sending the
  // reader through the door for them. It stays local — no surface needs to
  // know which of its cards is open, and the grid reflows around it on its own
  // (the open card spans the full row; see the note on the list item below).
  const [expanded, setExpanded] = useState(false);
  // The repository's registry skills that are not installed — the badge's
  // fact, and the second thing a bar press reveals. Their fold is the card's
  // own `expanded` rather than a state of their own: one bar, one fold, so a
  // card holding both cap-hidden rows and uninstalled ones never needs two
  // presses to show everything it has.
  const hasUninstalled = uninstalled != null && uninstalled.length > 0;
  // The owner segment is what the dataset hosts an avatar for; a repository
  // group always has one (a bare-host source is its own owner).
  const [owner] = repo.split("/");
  const shown = hasQuery || expanded ? skills : skills.slice(0, maxSkills);
  // A card can only expand past its cap when the cap is actually holding
  // something back: a search already lists everything (the cap stands down,
  // see the note on `hasQuery`), and a card within its cap has no rest to
  // reveal — both keep the bar's 「＋ N」 figure off unless uninstalled
  // siblings stand behind the badge.
  const canExpand = !hasQuery && skills.length > maxSkills;
  // The wide footprint, from any of the three sources: the reader's own
  // toggle in browse, a search answer that outruns the cap, or an open
  // uninstalled group — a press that reveals more skills is a press that
  // earns the room, and the wide layout is the same one the bar's expansion
  // uses (full grid row, two-column body), so both offers land identically.
  const wide =
    (canExpand && expanded) ||
    (hasQuery && skills.length > maxSkills) ||
    (hasUninstalled && expanded);
  // The toggle is also a transition. Opening a right-lane card re-plumbs the
  // whole grid — the card jumps to a full row start, every card after it
  // shifts, the open card's box doubles in width — and a hard cut between the
  // two layouts reads as teleporting. So the card is a `motion` layout
  // element: the reflow becomes one shared transition, the open card gliding
  // into its full-row footprint while its old row-mates step aside, all off
  // one FLIP pass (cheap — transforms only, measured once per reflow, and
  // nothing animates until a layout actually changes). Motion is dropped
  // entirely for readers who ask for reduced motion: they get the cut.
  const reducedMotion = useReducedMotion();
  // A transitioning card rides above its neighbours. During collapse the
  // cards after it step back up while its box is still shrinking — and since
  // every one of them animates, DOM order would paint a later card *over*
  // the shrinking one, reading as the list covering the card the reader just
  // folded. Elevating the card for the length of its own transition flips
  // that: it glides home on top, the way a lifted card settles back into a
  // deck. (The flag is only ever set on the card being toggled — neighbours
  // that merely shift never raise themselves. Without layout animations
  // there is no complete event to clear it, so reduced-motion readers never
  // set it either.) The lift is the z-order alone: no shadow rides the open
  // card, so the card reads on the shared `ring` every card wears and the
  // only thing that changes is what is on top — nothing can pop in a single
  // frame when the card folds.
  const [collapsing, setCollapsing] = useState(false);
  const lifted =
    (canExpand || hasUninstalled) && !reducedMotion && (expanded || collapsing);
  const toggleExpanded = () => {
    if (expanded && !reducedMotion) setCollapsing(true);
    setExpanded((value) => !value);
  };
  // The bar's own name: the repository when there is one, and the label for the
  // installed list's pool of skills no source vouches for when there is not.
  const name = repo || t("common.localInstall");
  // The bar's identity: the face, the name, the repository's weight. Shared by
  // the toggle and the plain label — who this is and how big it is read the
  // same whichever state the card is in. (The hover underline only arms inside
  // the toggle's `group/head`; a label never underlines.)
  const barIdentity = (
    <>
      {/* The identity is a size step above the rows: a 24px face and a
          14px name against the rows' 13px names and 13px glyphs. The bar
          sits under a hairline at the top of the card, so the step is
          what stops it from reading as one more row of the list. A pool
          of source-less installs has no owner to draw, so its name leads
          the bar alone. */}
      {repo ? (
        <OwnerAvatar owner={owner} className="size-6 shrink-0 text-[11px]" />
      ) : null}
      {/* No hover underline here: the name is not what a press acts on. The
          toggle's figure carries the hover feedback instead (see below), so
          the highlight lands on the control, never on a label. */}
      <span className="truncate text-sm font-semibold text-foreground">
        {name}
      </span>
      {/* The repository's weight rides its name, because that is what the
          figure is about: a fact about the repository, next to the
          repository, the way a follower count sits next to an account.
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
    </>
  );
  // The badge: the repository's uninstalled count, riding the bar's right end
  // as a status mark rather than a second row — the card stays one line tall
  // folded, and the fact reads in the same scan as the name and the stars. It
  // is quieter than the toggle chip (muted fill, pill shape) because it is
  // not the control: the whole bar is, and the badge answers "what is
  // missing here" while the chip answers "what a press adds". The hover
  // surface still fills — the badge sits inside the toggle's press area, and
  // a control the pointer is on owes it the same answer. Hovering also earns
  // one quiet sentence of explanation — the badge's figure 「2 个未安装」 is
  // compact enough to want a gloss — but the plainest the platform gives: a
  // native `title`, naming the repository and the fact, not the interaction
  // (the bar already answers for that).
  const uninstalledBadge = hasUninstalled ? (
    <span
      className="flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground tabular-nums transition-colors group-hover/head:bg-accent group-hover/head:text-foreground"
      title={t("state.uninstalledBadgeTip", {
        name,
        count: uninstalled.length,
      })}
    >
      {t("state.uninstalledCount", { count: uninstalled.length })}
    </span>
  ) : null;
  // The toggle's own figure — a chip: icon and number as one block, the one
  // thing that answers for the whole interaction. Folded, a plus over the
  // *increment*: 「＋ 5」, the exact number of rows a press reveals, read
  // straight off the card (three rows on screen, five more behind the cap).
  // Open, a minus beside the count the card now holds — 「− 15 个 skill」 —
  // which is both the fact the open card exists to show (its full size, no
  // counting rows across two columns) and the way back: the minus is the
  // fold. The chip is what carries the hover feedback — a quiet surface that
  // fills on point-over, the way every control in the app answers the
  // pointer — because the press acts on this mark, never on the repository's
  // name. A card that cannot expand shows no chip at all.
  const toggleChip = expanded ? (
    <span className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-foreground transition-colors group-hover/head:bg-accent">
      <Minus className="size-3" aria-hidden />
      {t("state.skillCount", { count: skills.length })}
    </span>
  ) : (
    <span className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium text-foreground tabular-nums transition-colors group-hover/head:bg-accent">
      <Plus className="size-3" aria-hidden />
      {skills.length - maxSkills}
    </span>
  );
  // The bar's right cluster — badge, then chip — as one group pushed to the
  // far end. The chip leads a press only when the cap is holding rows back;
  // the badge is the card's missing-skills fact either way. When neither is
  // drawn the cluster is nothing, and the bar reads as the plain label it is.
  const barActions =
    canExpand || hasUninstalled ? (
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {uninstalledBadge}
        {canExpand && toggleChip}
      </span>
    ) : null;

  return (
    <li
      className={cn(
        "relative flex flex-col",
        // An open card takes the whole row the grid offers — every track of
        // it, whatever the auto-fill came to (`1 / -1` is what `col-span-full`
        // means), so the revealed rows read at the width of the list rather
        // than of one lane. Auto-flow then lays the cards that follow under
        // the open one; a card that was the open one's row-mate moves down
        // with them.
        wide && "col-span-full",
        // While transitioning, the card rides above the neighbours it glides
        // over (its own transform already lifts it into a stacking context;
        // this raises it past the ones that merely shift).
        lifted && "z-10",
      )}
    >
      <MotionCard
        size="sm"
        data-repo={repo}
        layout={!reducedMotion}
        transition={reducedMotion ? undefined : EXPAND_TRANSITION}
        onLayoutAnimationComplete={() => setCollapsing(false)}
        className="group"
      >
        {/* The card's one bar, leading the card: what this repository is and
            how big it is — read first, so a scan of the grid reads as a scan
            of repositories with their skills folded under each. A hairline
            closes the bar off from the rows it names. On an expandable card
            the bar is the toggle that reveals the rest in place; on every
            other card it is a plain label — the rows, and the detail panel a
            row opens, are the only routes a card offers. */}
        <MotionCardHeader
          layout={!reducedMotion && "position"}
          transition={reducedMotion ? undefined : EXPAND_TRANSITION}
          className="min-w-0 flex items-center gap-2 border-b border-border/60 text-[11px] text-muted-foreground"
        >
          {canExpand || hasUninstalled ? (
            /* The expandable card's bar is a toggle: pressing it reveals (or
               folds away) everything the folded card holds back — the rows
               the cap was holding, and the repository's uninstalled skills
               behind their badge — right here, the shortest path from "this
               card" to "all of it". One bar, one fold: a card holding both
               never asks for two presses. The button is stretched over the
               header's whole height, its padding bleeding into the card's
               own, so every pixel a reader aims at the bar presses the
               toggle — a hit area the size of the text alone would make the
               bar's edges dead. `layout="position"` keeps the bar's text at
               its own size while the card surface scales around it — only
               the bar's spot in the card animates. The aria count is the
               card's whole offer: installed rows plus the uninstalled ones
               the badge stands for. */
            <motion.button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? t("state.collapseRepoAria", { name })
                  : t("state.expandRepoAria", {
                      name,
                      count:
                        skills.length +
                        (hasUninstalled ? uninstalled.length : 0),
                    })
              }
              layout={!reducedMotion && "position"}
              transition={reducedMotion ? undefined : EXPAND_TRANSITION}
              className="group/head -my-(--card-spacing) flex min-w-0 flex-1 cursor-pointer items-center gap-2 self-stretch rounded-md py-(--card-spacing) text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {barIdentity}
              {barActions}
            </motion.button>
          ) : (
            /* A bar with nothing to reveal is pure identity — the face, the
               name, the stars. No figure rides it: a count would answer "how
               many are here?" for a card whose every row is already on
               screen. The face rides the name whenever a repository stands
               behind it: a live card's owner is known (and the avatar
               resolves through the mirror, then GitHub's own endpoint — see
               `avatarCandidates`), while the local pool has no owner to
               draw. */
            <motion.span
              layout={!reducedMotion && "position"}
              transition={reducedMotion ? undefined : EXPAND_TRANSITION}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              {barIdentity}
            </motion.span>
          )}
          {/* The bar's one companion control: a sibling of the toggle, never a
              child, so a press on it cannot also fold the card. The installed
              list mounts the group switch here; the store mounts nothing. */}
          {footerAction && (
            <motion.span
              layout={!reducedMotion && "position"}
              transition={reducedMotion ? undefined : EXPAND_TRANSITION}
              className="flex shrink-0 items-center"
            >
              {footerAction}
            </motion.span>
          )}
        </MotionCardHeader>

        <CardContent>
          {/* A row is the unit of the body, and it is deliberately not a card:
              the repository is the card, and a skill inside it is one line of
              its content. The horizontal bleed lets the hover highlight read as
              a row band rather than as a box inside the card's padding. On a
              wide card — toggled open in browse, or wide by its own count
              under a search — the rows run in two balanced columns — the
              upper half of the list down the left, the rest down the right, so
              a full-width card does not turn every row into a full-width
              sweep. `grid-flow-col` over `ceil(n/2)` rows is what balances
              them: the items fill column-major, so the split is by count and
              stays put no matter how tall the individual rows run. Each row
              carries `layout="position"`: while the surface scales up around
              them, the rows themselves never stretch — they keep their size,
              glide into the two-column arrangement, and the region beyond
              them simply shows up as the surface grows past it (the card's
              own overflow clipping is the reveal mask). */}
          <ul
            className={cn(
              "-mx-1.5",
              wide
                ? "grid grid-flow-col auto-cols-fr gap-x-8"
                : "flex flex-col",
            )}
            style={
              wide
                ? {
                    gridTemplateRows: `repeat(${Math.ceil(shown.length / 2)}, auto)`,
                  }
                : undefined
            }
          >
            {shown.map(({ skill, matched, muted, extra, action }) => {
              const key = skillKey(skill);
              // A live skills.sh row claims only what its source carries —
              // which is no description and no classification at all — so it
              // draws neither the 暂无描述 placeholder nor the help mark (see
              // `isLiveSkill`); an installed row the store cannot resolve is a
              // local fact, and keeps both.
              const live = isLiveSkill(skill);
              const isSelected = selected != null && selected === key;
              // The caller's own row control, else the store's install button —
              // withheld from a live hit whose source no install id can be
              // rebuilt from (a discovery domain), whose install could only
              // fail. Either one only renders when this card carries row
              // actions at all (`rowActions={false}` leaves the bar's group
              // switch the one control).
              const control =
                action ??
                (isInstallableSkill(skill) ? (
                  <SkillInstallButton skill={skill} className="h-7 w-7" />
                ) : null);
              return (
                <motion.li
                  key={key}
                  data-skill={skill.name}
                  layout={!reducedMotion && "position"}
                  transition={reducedMotion ? undefined : EXPAND_TRANSITION}
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
                    aria-label={t("common.viewDetailAria", {
                      name: skill.name,
                    })}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 py-1 text-left focus-visible:outline-none",
                      isSelected && "text-primary",
                    )}
                  >
                    {/* The classification's glyph, in a fixed slot so the names
                        line up whether the skill is classified or not: a box for
                        the dataset's own 其他, the question mark for a skill
                        nothing classified — the same mark the list rows wear
                        (see `domainEmoji`). A live row draws nothing in the
                        slot, which stays fixed so the names still line up. */}
                    <span
                      aria-hidden="true"
                      className="w-4 shrink-0 text-center text-[13px]"
                    >
                      {!live && domainEmoji(skill.profile?.domain)}
                    </span>
                    {/* The name is the identifier and the row's one strong
                        element — semibold where the description is plain — and
                        it shrinks only up to half the row, so a long
                        description can never truncate it away. */}
                    <span className="max-w-[55%] shrink-0 truncate text-[13px] font-semibold">
                      <HighlightedText
                        text={skillDisplayName(skill)}
                        terms={matched?.name}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {live
                        ? null
                        : skillDescription(skill, locale) ||
                          t("common.noDescription")}
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
                      control that carries a state instead of an invitation —
                      the store's 已安装 badge, and the installed list's
                      disabled switch — is what the `has-data` rules keep on
                      screen: a fact does not wait for the pointer, because
                      the dimmed row (like the installed one) needs its
                      remedy visible. Each rule reads the control's own
                      state attribute (the install button's `data-state`,
                      the Base UI switch's boolean `data-unchecked`), so
                      this wrapper never has to know the state itself. */
                      <span className="absolute top-1/2 right-1 flex -translate-y-1/2 rounded-md bg-gradient-to-l from-accent via-accent to-transparent pl-6 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-data-[state=installed]:opacity-100 has-data-unchecked:opacity-100">
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
                </motion.li>
              );
            })}
          </ul>

          {/* The uninstalled group: the repository's registry skills the
              reader does not have. Its folded offer is the badge on the bar —
              the count rides the card's one line rather than a row of its
              own. Open, it reads as its own group, the way it always has: the
              hairline arrives with it, and under the line sits the group's
              marker row (a minus over the count) naming the second list
              before its rows begin — without it the rows would butt against
              the divider and read as one list with the installed ones. The
              marker is a fold control like the bar is: one fold, either press
              moves it. Each row carries the store's hover-revealed install
              button, and none opens the detail panel (this surface's drawer
              walks the *installed* list — an uninstalled row's destination is
              the install itself). The fold is the card's own `expanded`, so a
              card holding cap-hidden rows and uninstalled ones reveals both
              with the one press. */}
          {uninstalled && uninstalled.length > 0 && expanded && (
            <div className="mt-1 border-t border-border/60 pt-1">
              <button
                type="button"
                onClick={toggleExpanded}
                aria-expanded={expanded}
                aria-label={t("state.uninstalledToggleAria", {
                  name,
                  count: uninstalled.length,
                })}
                className="-mx-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex w-4 shrink-0 items-center justify-center"
                >
                  <Minus className="size-3" />
                </span>
                <span className="truncate font-medium">
                  {t("state.uninstalledCount", { count: uninstalled.length })}
                </span>
              </button>
              <ul
                aria-label={t("state.uninstalledListAria", { name })}
                className={cn(
                  "-mx-1.5",
                  // The same body the installed rows use on a wide card:
                  // column-major fill over a balanced row count, so a
                  // full-width card never turns every row into a
                  // full-width sweep — whichever press widened the card.
                  wide
                    ? "grid grid-flow-col auto-cols-fr gap-x-8"
                    : "flex flex-col",
                )}
                style={
                  wide
                    ? {
                        gridTemplateRows: `repeat(${Math.ceil(uninstalled.length / 2)}, auto)`,
                      }
                    : undefined
                }
              >
                {uninstalled.map((skill) => (
                  <li
                    key={skill.name}
                    data-skill={skill.name}
                    className="group/row relative flex items-center rounded-md px-1.5 transition-colors hover:bg-accent focus-within:bg-accent"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 py-1">
                      <span
                        aria-hidden="true"
                        className="w-4 shrink-0 text-center text-[13px]"
                      >
                        {domainEmoji(skill.profile?.domain)}
                      </span>
                        <span className="max-w-[55%] shrink-0 truncate text-[13px] font-semibold">
                          {skillDisplayName(skill)}
                        </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {skillDescription(skill, locale) ||
                          t("common.noDescription")}
                      </span>
                    </span>
                    {/* The same floating slot the installed rows' controls
                          live in: revealed on hover or focus, floating over a
                          gradient of the row's own hover surface. After an
                          install the button settles into its 已安装 badge and
                          the wrapper keeps it on screen. */}
                    <span className="absolute top-1/2 right-1 flex -translate-y-1/2 rounded-md bg-gradient-to-l from-accent via-accent to-transparent pl-6 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-data-[state=installed]:opacity-100 has-data-unchecked:opacity-100">
                      <SkillInstallButton skill={skill} className="h-7 w-7" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </MotionCard>
    </li>
  );
}
