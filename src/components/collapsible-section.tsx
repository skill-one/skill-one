import { useRef, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "cn";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

/** The nearest ancestor that actually scrolls, if any — the sticky header's
 *  compensation needs it to adjust the scroll position. The class check sits
 *  beside the computed style because jsdom (the tests) resolves no stylesheet,
 *  so the computed `overflow-y` would always read `visible`. */
function getScrollParent(node: HTMLElement): HTMLElement | null {
  let parent = node.parentElement;
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (
      /(auto|scroll)/.test(overflowY) ||
      parent.classList.contains("overflow-y-auto")
    ) {
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
 * viewport; folding the section removes its content below the header, the
 * section's containing block stops being tall enough to hold it pinned, and
 * the header snaps up out of view so the next section's header takes the top.
 * Measuring the header's viewport offset before the toggle lands and again
 * after the DOM settles, then shifting the scroll container by the difference,
 * pins the header where the pointer met it. For a header that was not pinned
 * the drift rounds to zero and the adjustment is a no-op.
 */
function keepHeaderUnderPointer(header: HTMLElement) {
  const container = getScrollParent(header);
  if (!container) return;
  const topBefore = header.getBoundingClientRect().top;
  // The toggle itself is applied by Base UI right after this handler; the
  // frame boundary guarantees the new layout (and the header's post-shrink
  // position) is measurable.
  requestAnimationFrame(() => {
    const drift = header.getBoundingClientRect().top - topBefore;
    if (Math.abs(drift) >= 1) {
      container.scrollTop += drift;
    }
  });
}

/**
 * One collapsible section of a grouped answer — the shell the search answer's
 * one supplement (skills.sh) draws its header through. A supplement is worth
 * acting on — a reader may want that other source's answer alone, or fold it
 * away — so the section keeps the full header treatment: the header row
 * pins to the top
 * of the scrolling container while its section passes, and the whole row
 * folds and unfolds the section — the count badge stays on the header either
 * way, so a folded section still states how much it holds.
 *
 * The header reads left to right as the disclosure chevron, the section's own
 * glyph (a fixed icon per source, supplied only where sources stack; or an
 * emoji where the section is a classification the taxonomy colors), the
 * title, and the count as a quiet badge riding the title. The chevron is
 * always drawn rather than hover-revealed: it is the one control on the row,
 * and its direction is the section's state, so a reader scanning folded
 * sections does not have to hover to learn which are folded. It points right
 * at rest (folded) and turns down 90° once the panel is open.
 *
 * When `checkable` is enabled, the chevron indicator smoothly swaps with a
 * multi-select checkbox on hover (or stays visible when selected/indeterminate/selectionMode).
 * Clicking the checkbox selects or deselects all items in the section without toggling
 * the collapsible state.
 *
 * The pinned header's opaque ground is a plain rectangle *around* the rounded
 * trigger: cards scrolling under a pinned header must be hidden edge to edge,
 * which the trigger's rounded hover corners would otherwise let them show
 * through. The panel carries the gap to the trigger (its top padding); when
 * the section folds the panel unmounts and the gap goes with it.
 *
 * The state is uncontrolled by default: the search answers remount on every
 * answer change (the caller keys the list by unit/query/filter), which resets
 * folds without anyone lifting the state up. A caller that wants the fold to
 * outlive the section — the installed list remembers its folds across page
 * switches (see `useViewMemory`) — passes `open` and `onOpenChange` instead,
 * and the section follows. Folding hides content visually only — the detail
 * drawer walks the flat data order, so its prev/next traversal is independent
 * of what is folded.
 */
export function CollapsibleSection({
  icon: Icon,
  glyph,
  title,
  count,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
  checkable = false,
  checked = false,
  indeterminate = false,
  selectionMode = false,
  onCheckChange,
  selectAriaLabel,
}: {
  /** The section's glyph; one fixed icon per source, when sources stack. */
  icon?: LucideIcon;
  /**
   * The section's emoji, where its identity is a colored classification mark
   * (a tag grouping's headers lead with the tag's own emoji). It rides beside
   * the title rather than inside it, so the header's accessible name stays
   * the label alone; `aria-hidden` because it decorates a name already read.
   */
  glyph?: string;
  /** The section's name, e.g. 今天 or 应用商店. */
  title: string;
  /** The section's own count phrase, e.g. 3 个 skill. */
  count: string;
  /** Whether the section starts unfolded; every caller starts open. */
  defaultOpen?: boolean;
  /**
   * The section's fold, from above. Present makes the section controlled: the
   * caller owns the state and answers for its persistence; absent leaves the
   * fold to the section itself, reset by whatever remounts it.
   */
  open?: boolean;
  /** The fold's change, when the section is controlled. */
  onOpenChange?: (open: boolean) => void;
  /** The section's body; whatever the caller lists inside it. */
  children: ReactNode;
  className?: string;
  /**
   * Whether this section header can be batch-selected via a leading checkbox.
   * When true, hovering over the header (or active selectionMode / checked / indeterminate)
   * replaces the chevron indicator with a group checkbox.
   */
  checkable?: boolean;
  /** Whether all items in this section are selected. */
  checked?: boolean;
  /** Whether some (but not all) items in this section are selected. */
  indeterminate?: boolean;
  /** Whether multi-selection mode is globally active. */
  selectionMode?: boolean;
  /** Callback fired when the group checkbox is clicked. */
  onCheckChange?: (checked: boolean) => void;
  /** Accessible label for the group checkbox. */
  selectAriaLabel?: string;
}) {
  const headerRef = useRef<HTMLElement | null>(null);
  const titleButtonRef = useRef<HTMLButtonElement | null>(null);
  const showCheckbox = Boolean(selectionMode || checked || indeterminate);

  return (
    // The element stays a plain <section> so the callers' sibling selectors
    // (border/separation between stacked sections) keep matching.
    <section aria-label={title} className={className}>
      {/* Controlled when the fold comes from above, uncontrolled otherwise —
          Base UI reads whichever pair is present. */}
      <Collapsible
        defaultOpen={open === undefined ? defaultOpen : undefined}
        open={open}
        onOpenChange={onOpenChange}
        className="group/section"
      >
        {/* The pinned ground: a square-cornered, opaque rectangle that hides
            cards scrolling behind it across its whole width — the rounded
            trigger inside would leave its corners transparent. It carries no
            padding of its own; the trigger owns the row's hit area. */}
        <div className="sticky top-0 z-10 bg-background">
          {!checkable ? (
            <CollapsibleTrigger
              render={
                // No horizontal padding, deliberately: the chevron's box sits on
                // the section's left edge, the same edge the cards below start
                // from — the header is the container, so it leads its content,
                // never indents inside it. The hover ground therefore spans the
                // exact width of the card grid, edge to edge. (The glyph's ink
                // is still ~4px inside its 16px box; that is the icon font's
                // own side bearing, shared by every lucide glyph.)
                <button
                  ref={headerRef as React.RefObject<HTMLButtonElement>}
                  type="button"
                  onClick={() => {
                    if (headerRef.current) {
                      keepHeaderUnderPointer(headerRef.current);
                    }
                  }}
                  className="group/head flex w-full items-center gap-2 rounded-md py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              }
            >
              {/* The disclosure state: right while folded, down 90° while open.
                  Base UI puts data-closed/data-open on the Collapsible root,
                  which is the named group this glyph reads. */}
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[open]/section:rotate-90"
              />
              {Icon && (
                <Icon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
              {glyph && (
                <span
                  aria-hidden="true"
                  // The row glyphs' slot geometry (see RepoCard's domain slot): a
                  // fixed 16px lane, so every header's title starts on one line.
                  className="w-4 shrink-0 text-center text-[13px] leading-none"
                >
                  {glyph}
                </span>
              )}
              <span className="truncate text-sm font-semibold">{title}</span>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {count}
              </Badge>
            </CollapsibleTrigger>
          ) : (
            <div
              ref={headerRef as React.RefObject<HTMLDivElement>}
              onClick={(e) => {
                if (e.target === headerRef.current) {
                  titleButtonRef.current?.click();
                }
              }}
              className="group/head flex w-full items-center gap-2 rounded-md py-2 text-left transition-colors hover:bg-accent"
            >
              {/* Leading position: Disclosure Chevron and hoverable/selectable Checkbox in the exact same spot */}
              <div className="relative flex size-4 shrink-0 items-center justify-center">
                <div
                  aria-hidden="true"
                  onClick={() => {
                    titleButtonRef.current?.click();
                  }}
                  className={cn(
                    "flex size-full cursor-pointer items-center justify-center transition-opacity duration-150",
                    showCheckbox
                      ? "opacity-0 pointer-events-none"
                      : "opacity-100 group-hover/head:opacity-0 group-focus-within/head:opacity-0 pointer-events-auto",
                  )}
                >
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[open]/section:rotate-90"
                  />
                </div>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-opacity duration-150",
                    showCheckbox
                      ? "opacity-100 pointer-events-auto"
                      : "opacity-0 pointer-events-none group-hover/head:opacity-100 group-hover/head:pointer-events-auto group-focus-within/head:opacity-100 group-focus-within/head:pointer-events-auto",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <Checkbox
                    checked={checked}
                    indeterminate={indeterminate}
                    onCheckedChange={(c) => onCheckChange?.(Boolean(c))}
                    aria-label={selectAriaLabel ?? title}
                  />
                </span>
              </div>

              {/* The rest of the row toggles the collapsible */}
              <CollapsibleTrigger
                render={
                  <button
                    ref={titleButtonRef}
                    type="button"
                    onClick={() => {
                      if (headerRef.current) {
                        keepHeaderUnderPointer(headerRef.current);
                      }
                    }}
                    className="flex min-w-0 flex-1 self-stretch items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                  />
                }
              >
                {Icon && (
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                {glyph && (
                  <span
                    aria-hidden="true"
                    className="w-4 shrink-0 text-center text-[13px] leading-none"
                  >
                    {glyph}
                  </span>
                )}
                <span className="truncate text-sm font-semibold">{title}</span>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {count}
                </Badge>
              </CollapsibleTrigger>
            </div>
          )}
        </div>
        {/* pt-2, with the trigger's own pb-2, makes the title-to-content gap
            16px — the same distance the cards/rows keep among themselves. The
            panel unmounts when folded, so a folded header carries no tail. */}
        <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
