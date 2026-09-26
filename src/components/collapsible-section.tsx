import { useRef, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { Badge } from "./ui/badge";
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
 * three sources (本地已安装, 应用商店, skills.sh) draw their headers through.
 * Source grouping is worth acting on — a reader may want one source's answer
 * alone — so these sections keep the full header treatment the ordering-
 * metadata groups forgo (see `GroupSection`): the header row pins to the top
 * of the scrolling container while its section passes, and the whole row
 * folds and unfolds the section — the count badge stays on the header either
 * way, so a folded section still states how much it holds.
 *
 * The header reads left to right as the disclosure chevron, the section's own
 * glyph (a fixed icon per source, supplied only where sources stack), the
 * title, and the count as a quiet badge riding the title. The chevron is
 * always drawn rather than hover-revealed: it is the one control on the row,
 * and its direction is the section's state, so a reader scanning folded
 * sections does not have to hover to learn which are folded. It points right
 * at rest (folded) and turns down 90° once the panel is open.
 *
 * The pinned header's opaque ground is a plain rectangle *around* the rounded
 * trigger: cards scrolling under a pinned header must be hidden edge to edge,
 * which the trigger's rounded hover corners would otherwise let them show
 * through. The panel carries the gap to the trigger (its top padding); when
 * the section folds the panel unmounts and the gap goes with it.
 *
 * The state is deliberately uncontrolled: the lists remount on every answer
 * change (the caller keys the list by unit/query/filter), which resets folds
 * without anyone lifting the state up. Folding hides content visually only —
 * the detail drawer walks the flat data order, so its prev/next traversal is
 * independent of what is folded.
 */
export function CollapsibleSection({
  icon: Icon,
  title,
  count,
  defaultOpen = true,
  children,
  className,
}: {
  /** The section's glyph; one fixed icon per source, when sources stack. */
  icon?: LucideIcon;
  /** The section's name, e.g. 今天 or 应用商店. */
  title: string;
  /** The section's own count phrase, e.g. 3 个 skill. */
  count: string;
  /** Whether the section starts unfolded; every caller starts open. */
  defaultOpen?: boolean;
  /** The section's body; whatever the caller lists inside it. */
  children: ReactNode;
  className?: string;
}) {
  const headerRef = useRef<HTMLButtonElement | null>(null);

  return (
    // The element stays a plain <section> so the callers' sibling selectors
    // (border/separation between stacked sections) keep matching.
    <section aria-label={title} className={className}>
      <Collapsible defaultOpen={defaultOpen} className="group/section">
        {/* The pinned ground: a square-cornered, opaque rectangle that hides
            cards scrolling behind it across its whole width — the rounded
            trigger inside would leave its corners transparent. It carries no
            padding of its own; the trigger owns the row's hit area. */}
        <div className="sticky top-0 z-10 bg-background">
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
                ref={headerRef}
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
          <span className="truncate text-sm font-semibold">{title}</span>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {count}
          </Badge>
          </CollapsibleTrigger>
        </div>
        {/* pt-2, with the trigger's own pb-2, makes the title-to-content gap
            16px — the same distance the cards/rows keep among themselves. The
            panel unmounts when folded, so a folded header carries no tail. */}
        <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
