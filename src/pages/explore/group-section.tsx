import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Star } from "lucide-react";

import { ordinalClass } from "../../lib/ordinal";
import { SKILL_LIST_CLASS } from "../../lib/skill-list-layout";
import { cn, formatCount } from "../../lib/utils";
import { OwnerAvatar } from "../../components/owner-avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";

/** How many of a group's items mount with the group when the layout can't
 * be measured yet; the rest wait behind the expander, so a 50-skill
 * monorepo reads like any other group. */
const PREVIEWED_ITEMS = 6;

/** How many rows the preview shows before the expander takes over. */
const PREVIEW_ROWS = 2;

/**
 * The identity and figures a group header shows, attached by whoever built
 * the group. Everything is optional except the key and title: a group may
 * carry the owner avatar and the stars its ordering used.
 */
export interface GroupMeta {
  /** Stable identity for folding state and React keys. */
  key: string;
  /** The header's main line: repo name, bucket range, or domain name. */
  title: string;
  /**
   * A quiet aside after the title, when the group needs one line of context
   * that its name cannot carry (e.g. where a section's skills come from).
   */
  note?: string;
  /** The owner whose avatar leads the header, when one exists. */
  avatarOwner?: string;
  /** The stars the ordering used, when the mode orders by them. */
  stars?: number;
  /**
   * How the leading ordinal reads. `rank` (the default) medals the top three
   * sections, which fits a mode whose groups are ordered by a figure. A mode
   * that only sequences its groups opts into `plain`: in the installed list's
   * time view the first section is merely the most recent, and a medal on
   * 今天 would imply it won something.
   */
  ordinal?: "rank" | "plain";
}

/** The nearest ancestor that actually scrolls, if any — the sticky header's
 * compensation needs it to adjust the scroll position. The class check sits
 * beside the computed style because jsdom (the tests) resolves no
 * stylesheet, so the computed `overflow-y` would always read `visible`. */
function getScrollParent(node: HTMLElement): HTMLElement | null {
  let parent = node.parentElement;
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (/(auto|scroll)/.test(overflowY) || parent.classList.contains("overflow-y-auto")) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Keep the sticky header under the pointer across a height change it caused.
 *
 * While the header is pinned, its natural position is somewhere above the
 * viewport; any toggle that shrinks the group — the header's own fold, or
 * the preview expander snapping from every card back to a few — removes cards
 * below it, the header's containing block stops being tall enough to hold it
 * pinned, and it snaps up out of view so the next group's header takes the
 * top. Measuring the header's viewport offset before the toggle lands and
 * again after the DOM settles, then shifting the scroll container by the
 * difference, pins the header where the pointer met it.
 *
 * For a header that was not pinned the drift rounds to zero and the
 * adjustment is a no-op, so expanding the preview and mid-page folds are
 * untouched. The measurement always reads the *header* (not the control that
 * was clicked) so the same routine serves both the header and the expander.
 */
function keepHeaderUnderPointer(header: HTMLElement) {
  const container = getScrollParent(header);
  if (!container) return;
  const topBefore = header.getBoundingClientRect().top;
  // The toggle itself is applied by React right after this handler; the frame
  // boundary guarantees the new layout (and the header's post-shrink
  // position) is measurable.
  requestAnimationFrame(() => {
    const drift = header.getBoundingClientRect().top - topBefore;
    if (Math.abs(drift) >= 1) {
      container.scrollTop += drift;
    }
  });
}

/**
 * One group of a grouped list, in the style of a Notion gallery section: a
 * lightweight, borderless header row — the group's ordinal, its avatar or
 * glyph, its title, and its figures in quiet text — over the group's card
 * grid. All the visual weight lives in the cards; the group itself is just
 * typography and spacing.
 *
 * The shell is shared by every grouped surface — the live skills.sh section and
 * the installed list's groupings — and is mode-agnostic: whoever built the
 * group attaches
 * the identity metadata ({@link GroupMeta}) and the items, and renders each
 * item's row through {@link GroupSectionProps.renderItem} — the shell knows
 * nothing about what a row looks like.
 *
 * The store's repository mode is deliberately not one of them: a repository is
 * an object with a page of its own rather than a bucket of skills, so it is
 * rendered as one card per repository (see `RepoCard`) — the header this shell
 * would draw duplicates what that card's own head already says, and its preview
 * expander is the card's cap.
 *
 * The leading header slot shows the group's ordinal — the place a fold
 * chevron would sit — and gives it up to the chevron only while the pointer
 * is over the header (Notion's toggle reveal). The top three ordinals are
 * simply colored — gold, silver, bronze. The name's right edge carries the
 * stars the ordering used, then the item count, when the builder supplied
 * them. The header background is always opaque — it pins over scrolling
 * cards, so any translucency would let them bleed through.
 *
 * The header is the shadcn Collapsible trigger and `position: sticky` within
 * the page's scroll container, so while a group's cards scroll past, its
 * header stays pinned to the top edge and lets go when the group ends — the
 * same behavior as a Notion section title. A folded group renders no rows,
 * so folding is purely a reading choice, never a performance one (the page
 * reveals groups progressively on scroll instead).
 *
 * Within the grid, the preview holds {@link PREVIEW_ROWS} rows of the
 * current layout — measured from the mounted grid — and a longer group ends
 * with an expander ("展开其余 N 个") that reveals the rest in place.
 *
 * `selected` is the identity (`skillKey`) of the item the detail drawer shows,
 * in the same coordinates `rowKey` gives the group's rows — so `renderItem`
 * only has to say whether its own row is the selected one, and a regrouping
 * mid-open keeps the highlight on the same skill.
 */
export function GroupSection<T>({
  group,
  index,
  items,
  selected,
  renderItem,
  rowKey,
}: {
  /** The group's identity and header figures. */
  group: GroupMeta;
  /** The group's ordinal in the current answer, zero-based. */
  index: number;
  /** Every item of the group, in the order the mode's ordering produced. */
  items: T[];
  /** Identity of the item in the detail panel; null keeps the panel closed. */
  selected: string | null;
  /** Renders one row; `selected` lights the row per the panel state. */
  renderItem: (item: T, selected: boolean) => ReactNode;
  /** Stable key for one item: React's, and the selection's coordinate. */
  rowKey: (item: T) => string;
}) {
  // Items beyond the preview stay mounted-but-hidden only in the sense of
  // state: they are not rendered until the expander opens.
  const [showAll, setShowAll] = useState(false);
  const gridRef = useRef<HTMLUListElement | null>(null);
  const headerRef = useRef<HTMLButtonElement | null>(null);
  // The preview holds PREVIEW_ROWS of the current grid, not a fixed count:
  // the auto-fill grid lays out more columns on a wide window than a narrow
  // one, so the row capacity is measured from the resolved grid tracks.
  // Until a real layout reports itself — first paint, or a test environment
  // with no layout at all — the fixed fallback applies.
  const [previewCount, setPreviewCount] = useState(PREVIEWED_ITEMS);
  const visibleItems = showAll ? items : items.slice(0, previewCount);
  const hiddenCount = items.length - previewCount;

  // Re-measuring whenever the expander toggles also re-arms the observer
  // after a fold/unfold cycle remounts the grid, and lets a test feed the
  // grid explicit tracks. While everything is shown there is nothing to size.
  useEffect(() => {
    const grid = gridRef.current;
    if (showAll || !grid) return;
    const measure = () => {
      // The resolved grid-template-columns is the layout's own answer — one
      // track per column, gaps already accounted. No real tracks (jsdom
      // answers "none", or a group not yet laid out) keeps the fixed
      // fallback.
      const tracks = getComputedStyle(grid)
        .gridTemplateColumns.split(" ")
        .filter((track) => track && track !== "none").length;
      if (tracks > 0) {
        setPreviewCount(tracks * PREVIEW_ROWS);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [showAll]);

  return (
    <Collapsible defaultOpen className="group/repo">
      <CollapsibleTrigger
        render={
          <button
            ref={headerRef}
            type="button"
            aria-label={`分组 ${group.title}，${items.length} 个 skill`}
            onClick={() => {
              if (headerRef.current) keepHeaderUnderPointer(headerRef.current);
            }}
            className="group/head sticky top-0 z-10 flex w-full items-center gap-1.5 rounded-md bg-background px-1 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
          {/* The leading slot reads as the group's ordinal while the header
              is at rest and becomes the fold chevron on hover — Notion's
              toggle reveal. One fixed-width box hosts both, so every name
              starts at the same offset either way. The top three ordinals
              are simply colored — gold, silver, bronze — a quiet nod to the
              podium with no badge competing with the avatar beside them. */}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <ChevronDown
              aria-hidden
              className="hidden h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover/head:block group-data-closed/repo:-rotate-90"
            />
            <span
              className={cn(
                "text-xs group-hover/head:hidden",
                ordinalClass(index, group.ordinal !== "plain"),
              )}
            >
              {index + 1}
            </span>
          </span>
          {/* The identity slot: the owner's avatar when one exists, nothing
              otherwise. */}
          {group.avatarOwner ? (
            <OwnerAvatar
              owner={group.avatarOwner}
              className="h-5 w-5 shrink-0"
            />
          ) : null}
          <span className="truncate text-sm font-medium">{group.title}</span>
          {group.note && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {group.note}
            </span>
          )}
          {/* The figures the group is weighed by, pinned to the row's far
              edge as one quiet cluster: the stars the ordering used, then
              the item count. */}
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              {group.stars !== undefined && (
                <span
                  className="flex items-center gap-1"
                  title={`${group.stars} stars`}
                >
                  <Star
                    className="h-3 w-3 fill-amber-400 text-amber-400"
                    aria-hidden
                  />
                  {formatCount(group.stars)}
                  <span aria-hidden="true">·</span>
                </span>
              )}
              <span>{items.length} 个</span>
            </span>
          </button>
        }
      />
      <CollapsibleContent>
        {/* A little indent under the header's chevron, and bottom spacing
            before the next group; no divider — the whitespace is the
            separation, as in Notion. The card grid opts into the browser's
            render skipping (content-visibility): an expanded group whose
            cards sit outside the viewport costs no paint or layout until it
            is scrolled toward, with the intrinsic size keeping the scrollbar
            honest. The header stays outside this — it must render to stick. */}
        <div className="pt-1 pb-3 pl-5">
          <ul
            ref={gridRef}
            className={cn(
              SKILL_LIST_CLASS,
              "[content-visibility:auto] [contain-intrinsic-size:auto_380px]",
              // content-visibility implies paint containment: descendants are
              // clipped to this element's border-box. The Card draws its
              // border as an outer box-shadow ring, which protrudes 1px past
              // the grid on all four sides — the edge rows' and columns'
              // borders would be sheared off (top edge reads as if the
              // sticky header covered it). p-1 opens a bleed gutter inside
              // the containment boundary; -m-1 cancels the layout shift.
              "p-1 -m-1",
            )}
          >
            {/* renderItem hands back the row's own <li> (the shared card
                renders as one), so the key rides on a fragment. */}
            {visibleItems.map((item) => (
              <Fragment key={rowKey(item)}>
                {renderItem(item, selected != null && rowKey(item) === selected)}
              </Fragment>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => {
                // Snapping the preview back to a few cards shrinks the group
                // the same way a fold does, so the sticky header needs the
                // same scroll compensation to stay put.
                if (headerRef.current) keepHeaderUnderPointer(headerRef.current);
                setShowAll((v) => !v);
              }}
              aria-expanded={showAll}
              className="mt-1 flex items-center gap-1 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150",
                  showAll && "rotate-180",
                )}
              />
              {showAll ? "收起" : `展开其余 ${hiddenCount} 个`}
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
