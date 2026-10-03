import { Link } from "react-router";

import { cn } from "../lib/utils";
import { isTauri } from "../lib/tauri";
import { AppNav } from "./app-nav";
import { SettingsMenu } from "./settings-menu";

/**
 * The app's chrome, one row: the destinations at the leading edge, the brand
 * dead centre and the window's settings closing it, with the window's drag
 * region over the lot.
 *
 * One row and no more, and nothing in it that belongs to a page. The row opens
 * with the segmented navigation (see `AppNav`) — the control says which of its
 * lists is on screen — closes with the actions, and carries the mark in the
 * middle, the way a unified toolbar's title does. Settings stay, because they
 * are the window's and answer on every route. Everything else a page needs
 * belongs to that page: the search field, the scope picker and the sort switch
 * are the list's own controls and stand on the list's own row above the answer
 * they shape (see `ListToolbar`). The leading edge is kept clear of the lights
 * by the padding (`pl-24`: the native 20pt leading inset + 52pt of buttons +
 * air), so on macOS the navigation starts just past them, the way a unified
 * toolbar's items do.
 *
 * The mark is centred on the *window*, not on the row's free space: it is taken
 * out of the flow and centred over the header's padding box
 * (`absolute inset-0 … items-center justify-center`), because the padding is
 * lopsided — the lights push the leading edge out to `pl-24` while the trailing
 * one is `pr-8` — so three in-flow columns, or `ml-auto` on the far end, would
 * sit the mark visibly right of centre. Overlaying is safe because the window's
 * floor is `minWidth: 1150` (see `tauri.conf.json`), which leaves the mark's own
 * width clear of the navigation at the far end of the range; below that the row
 * would have to drop one of the two.
 *
 * The window runs `titleBarStyle: "Overlay"`, so macOS keeps its own title bar
 * — a transparent strip the webview shows through — and parks the traffic
 * lights near the window's top, centred in the native 28px strip. This row is
 * taller than that strip and centres its own content, so the window config
 * moves the lights onto the row's axis instead: `trafficLightPosition.y =
 * height / 2 + 2`. The 2 is wry's, which layers AppKit's own offset under the
 * request — the lights' visual centre lands at `y - 2`, which is what the row
 * centres itself on. So this row's height and the config's `y` are one fact,
 * and this comment is the only place they meet: the config is JSON and cannot
 * say so itself. Change the height below and `y` has to follow, or the lights
 * leave the centreline. Centring a band this tall on the lights is what macOS
 * itself does in a unified toolbar.
 *
 * The row is also the window's drag region, and it claims the whole subtree:
 * `"deep"` covers every descendant, so its empty stretches move the window.
 * Tauri walks up from whatever was clicked, and a clickable element without the
 * attribute — the brand, a link, the settings entry — stops the walk there, so
 * nothing inside loses its own click.
 */
export function AppHeader() {
  // `h-header` (3rem) is half of the alignment above: the window config's
  // traffic-light `y` is this height over two, plus wry's 2px offset
  // (48 / 2 + 2 = 26).
  return (
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "relative flex h-header shrink-0 items-center gap-3 border-b border-border bg-background pr-8",
        isTauri() ? "pl-24" : "pl-8",
      )}
    >
      <AppNav />
      {/* The mark rides over the row rather than in it, so the padding's
          asymmetry cannot drag it off the window's centre. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Brand />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SettingsMenu />
      </div>
    </header>
  );
}

/**
 * The brand mark: the logo and the word, and the window's way home — the agents
 * graph at `/` (see the app's routes), which is what the mark stands for.
 */
function Brand() {
  return (
    <Link
      to="/"
      className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <img
        src="/skill-one-transparent.png"
        alt=""
        className="size-5 shrink-0 object-contain"
      />
      <span className="text-[13px] font-semibold text-foreground">
        Skill One
      </span>
    </Link>
  );
}
