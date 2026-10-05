import { cn } from "../lib/utils";
import { isTauri, isMacOS } from "../lib/tauri";
import { AppNav } from "./app-nav";
import { SettingsMenu } from "./settings-menu";

/**
 * The app's chrome, one row: the destinations at the leading edge, the brand
 * dead centre and the window's settings closing it, with the window's drag
 * region over the lot.
 *
 * One row and no more, and nothing in it that belongs to a page. Settings stay
 * because they are the window's and answer on every route; everything a list
 * needs belongs to that list — its question and the scope, shape and order that
 * read the answer all stand on the list's own first row (see `ListToolbar`), so
 * a search field in here would be a field whose list is one route away. The row
 * opens with the segmented navigation (see `AppNav`) — the control says which of
 * its lists is on screen — closes with the settings, and carries the mark in the
 * middle, the way a unified toolbar's title does. The leading edge is kept clear
 * of the lights by the padding (`pl-24`: the native 20pt leading inset + 52pt of
 * buttons + air), so on macOS the navigation starts just past them, the way a
 * unified toolbar's items do.
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
 * `"deep"` covers every descendant, so its empty stretches move the window —
 * the brand's stretch included, which is most of the middle of the row. Tauri
 * walks up from whatever was clicked, and a clickable element without the
 * attribute — a link, the settings entry — stops the walk there, so nothing
 * inside loses its own click.
 */
export function AppHeader() {
  return (
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "relative flex h-header shrink-0 items-center gap-3 border-b border-border bg-background pr-8",
        isTauri() && isMacOS() ? "pl-24" : "pl-8",
      )}
    >
      <AppNav />
      {/* The mark rides over the row rather than in it, so the padding's
          asymmetry cannot drag it off the window's centre.

          `pointer-events-none` because this wrapper is `inset-0` — it spans the
          whole header, not just the mark — and it paints after the nav, so
          without this it swallows every click meant for the nav links. The mark
          stays under it: it is a title, not a link — the nav's home segment is
          the way back, and a second door to the same place would only make the
          reader ask which one is the real one. jsdom has no pointer-event hit
          testing, so only the end-to-end suite can see this. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Brand />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SettingsMenu />
      </div>
    </header>
  );
}

/**
 * The brand mark: the logo and the word. A title, the way a unified toolbar's
 * is — not a link home. The home already leads the row (see `AppNav`), so a
 * second, centred way back would be one destination with two doors, and the
 * under-the-pointer stretch this frees up is the window's drag region — most
 * of the middle of the row moves the window again.
 */
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