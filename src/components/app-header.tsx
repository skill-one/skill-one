import { useLocation } from "react-router";

import { cn } from "../lib/utils";
import { isTauri } from "../lib/tauri";
import { ListToolbar } from "./list-toolbar";
import type { Destination } from "../lib/list-view";

/** What a route puts in the header. */
export interface HeaderRoute {
  /** The list this route shows, when it shows one. */
  destination?: Destination;
}

/**
 * The one decision the header makes: which route is on screen, and what its row
 * therefore holds.
 *
 * A route either shows a list — and then the row spans that list's controls,
 * search at the leading edge and the unit switch at the trailing one — or it is
 * a page inside one, and then the row holds neither: those pages carry their own
 * head, way back and all (see `DrillDownHead`). The header is the window's
 * chrome and only that, so it holds what both lists answer to and nothing a
 * single page has an opinion about.
 *
 * Pure, so the mapping can be read off directly in a test.
 */
export function headerRoute(pathname: string): HeaderRoute {
  if (pathname === "/explore") return { destination: "store" };
  if (pathname === "/my-skills") return { destination: "installed" };
  return {};
}

/**
 * The app's chrome, one row: the brand on the window's centreline, the current
 * list's own controls either side of it, and the window's drag region.
 *
 * One row and no more. The brand takes the middle, which is what the middle of a
 * mac window is for — it names the window, where a native one puts its title. The
 * controls a list answers to (see `ListToolbar`) span the row either side of it:
 * the search field opens the row at the leading edge, just past the traffic
 * lights, and the unit switch closes it at the trailing edge. Everything else a
 * page needs belongs to that page, including the way out of a drill-down, which
 * is drawn by the page it leaves (see `DrillDownHead`).
 *
 * The row therefore empties out on a page inside a list — a repository's, the
 * local pool's — and that is the point rather than a gap: the header is the
 * window's, and a reader on one repository's page is looking at the page, not at
 * the title bar above it. The leading edge is kept clear of the lights by the
 * padding (`pl-24`: the native 20pt leading inset + 52pt of buttons + air),
 * which is what stands between the last button and whatever leads the row — the
 * search field, when the route has one, and nothing when it does not.
 *
 * The window runs `titleBarStyle: "Overlay"`, so macOS keeps its own title bar —
 * a transparent strip the webview shows through — and parks the traffic lights
 * near the window's top, centred in the native 28px strip. This row is taller
 * than that strip and centres its own content, so the window config moves the
 * lights onto the row's axis instead: `trafficLightPosition.y = height / 2 + 2`.
 * The 2 is wry's, which layers AppKit's own offset under the request — the
 * lights' visual centre lands at `y - 2`, which is what the row centres itself
 * on. So this row's height and the config's `y` are one fact, and this comment
 * is the only place they meet: the config is JSON and cannot say so itself.
 * Change the height below and `y` has to follow, or the lights leave the
 * centreline. Centring a band this tall on the lights is what macOS itself does
 * in a unified toolbar.
 *
 * The row is also the window's drag region, and it claims the whole subtree:
 * `"deep"` covers every descendant, so the brand and the empty stretches all
 * move the window. Tauri walks up from whatever was clicked, and a clickable
 * element without the attribute — a button, a link, the search field — stops the
 * walk there, so nothing inside loses its own click.
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const route = headerRoute(pathname);

  // `h-10` is half of the alignment above: the window config's traffic-light `y`
  // is this height over two, plus wry's 2px offset (40 / 2 + 2 = 22).
  return (
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "relative flex h-10 shrink-0 items-center gap-3 border-b border-border bg-background pr-8",
        isTauri() ? "pl-24" : "pl-8",
      )}
    >
      {/* Out of the row's flow on purpose: it is the window's mark, not the
          first of the row's items, and the row's other items lay themselves out
          from the edges either side of it. */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <Brand />
      </div>
      {route.destination != null && (
        <ListToolbar destination={route.destination} />
      )}
    </header>
  );
}

/** The brand mark: the logo and the word, at rest — not a link to anywhere. */
function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <img
        src="/skill-one-transparent.png"
        alt=""
        className="size-5 shrink-0 object-contain"
      />
      <span className="text-[13px] font-semibold text-foreground">
        Skill One
      </span>
    </div>
  );
}
