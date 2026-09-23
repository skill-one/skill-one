import { Link, useLocation } from "react-router";
import { ArrowLeft } from "lucide-react";

import { cn } from "../lib/utils";
import { isTauri } from "../lib/tauri";
import { useReturn } from "../hooks/use-return";
import { ListToolbar } from "./list-toolbar";
import type { Destination } from "../lib/list-view";

/** What a route puts in the header. */
export interface HeaderRoute {
  /** The list this route shows, when it shows one. */
  destination?: Destination;
  /**
   * A drill-down's way back: where it points when there is nothing to pop. The
   * words are not the route's to choose — every drill-down says 返回, because the
   * reader got here from one place and can see which page they are on.
   */
  back?: { fallback: string };
}

/**
 * The one decision the header makes: which route is on screen, and what its row
 * therefore holds.
 *
 * Every route either shows a list — and then the row spans that list's controls,
 * search at the leading edge and the unit switch at the trailing one — or is a
 * page inside one, and then the row holds the way back instead. That is why the
 * header swaps its contents rather than each page rendering a bar of its own:
 * the row above the content says what the current page is and what can be done
 * to it, wherever the reader is.
 *
 * Pure, so the mapping can be read off directly in a test.
 */
export function headerRoute(pathname: string): HeaderRoute {
  if (pathname === "/explore") return { destination: "store" };
  if (pathname === "/my-skills") return { destination: "installed" };
  if (pathname.startsWith("/repo/")) return { back: { fallback: "/explore" } };
  if (pathname === "/my-skills/local") {
    return { back: { fallback: "/my-skills" } };
  }
  return {};
}

/**
 * The app's chrome, one row: the brand on the window's centreline, the current
 * page's own controls at the trailing edge, and the window's drag region.
 *
 * One row and no more. The brand takes the middle, which is what the middle of a
 * mac window is for — it names the window, where a native one puts its title. The
 * controls a list answers to (see `ListToolbar`) span the row either side of it:
 * the search field opens the row at the leading edge, just past the traffic
 * lights, and the unit switch closes it at the trailing edge. Everything else a
 * page needs belongs to that page: it opens the content, under the header rather
 * than in it.
 *
 * A drill-down swaps them for its way back, which takes the leading edge for
 * itself — the same edge, kept clear of the lights by the padding (`pl-24`: the
 * native 20pt leading inset + 52pt of buttons + air). That padding is what
 * stands between the last button and whatever leads the row, whichever it is.
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
  const back = useReturn(route.back?.fallback ?? "/explore");

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
      {route.back != null && (
        <Link
          to={back.to}
          onClick={back.onClick}
          className="flex w-fit shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {/* The mark and one word. Naming the destination would say what the
              page behind this one already says: a repository page is the
              store's, the local pool is the installed list's, and the reader
              got here from it a click ago. */}
          返回
        </Link>
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
