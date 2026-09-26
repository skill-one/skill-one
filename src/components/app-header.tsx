import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";

import { cn } from "../lib/utils";
import { isTauri } from "../lib/tauri";
import { AppNav } from "./app-nav";
import { SearchInput } from "./search-input";
import { SettingsMenu } from "./settings-popover";
import { useListQuery } from "../hooks/use-list-view";
import { useRegistrySnapshot } from "../hooks/use-registry-snapshot";
import { setQuery, type Destination } from "../lib/list-view";

/** What a route puts in the header. */
export interface HeaderRoute {
  /** The list this route shows, when it shows one. */
  destination?: Destination;
}

/**
 * The one decision the header makes: which route is on screen, and what its row
 * therefore holds.
 *
 * A route either shows a list — and then the row carries that list's search
 * field — or it is a page inside one, and then the field stands down: those
 * pages carry their own head, way back and all (see `DrillDownHead`). The
 * header is the window's chrome, so it holds what both lists answer to and
 * nothing a single page has an opinion about.
 *
 * Pure, so the mapping can be read off directly in a test.
 */
export function headerRoute(pathname: string): HeaderRoute {
  if (pathname === "/explore") return { destination: "store" };
  if (pathname === "/my-skills") return { destination: "installed" };
  return {};
}

/**
 * The app's chrome, one row: the brand and the two destinations at the leading
 * edge, the list's search and the window's settings closing it, and the
 * window's drag region over the lot.
 *
 * One row and no more. It opens with the brand and the segmented navigation
 * (see `AppNav`) — the mark names the window, the control says which of its
 * two lists is on screen — and it closes with the actions. The search field
 * answers to whichever list is mounted, which is why it stands down on a page
 * inside one rather than searching a list the reader is not looking at;
 * settings stay, because they are the window's and answer on every route.
 * Everything else a page needs belongs to that page, including the way out of
 * a drill-down, which is drawn by the page it leaves (see `DrillDownHead`).
 * The leading edge is kept clear of the lights by the padding (`pl-24`: the
 * native 20pt leading inset + 52pt of buttons + air), so on macOS the brand
 * starts just past them, the way a unified toolbar's items do.
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
 * `"deep"` covers every descendant, so the brand and the empty stretches all
 * move the window. Tauri walks up from whatever was clicked, and a clickable
 * element without the attribute — a button, a link, the search field — stops
 * the walk there, so nothing inside loses its own click.
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const route = headerRoute(pathname);

  // `h-12` is half of the alignment above: the window config's traffic-light
  // `y` is this height over two, plus wry's 2px offset (48 / 2 + 2 = 26).
  return (
    <header
      data-tauri-drag-region="deep"
      className={cn(
        "relative flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background pr-8",
        isTauri() ? "pl-24" : "pl-8",
      )}
    >
      <Brand />
      <AppNav />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {route.destination != null && (
          <HeaderSearch destination={route.destination} />
        )}
        <SettingsMenu />
      </div>
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

/**
 * The list's search field, bound to the shared view (see `lib/list-view`): one
 * field to type in, one query to answer, wherever the reader happens to be.
 *
 * The field stays enabled on the installed list and is locked on the store's
 * until the index over the registry exists: the installed list is already in
 * memory, while a query over a partially downloaded registry would answer
 * wrongly.
 */
function HeaderSearch({ destination }: { destination: Destination }) {
  const { t } = useTranslation();
  const query = useListQuery();

  // `ready` on its own, so a climbing count never re-renders the header.
  const ready = useRegistrySnapshot((s) => s.ready);
  const waiting = destination === "store" && !ready;

  return (
    <SearchInput
      value={query}
      onChange={setQuery}
      label={t("common.searchSkills")}
      disabled={waiting}
      placeholder={waiting ? t("common.indexBuilding") : undefined}
    />
  );
}
