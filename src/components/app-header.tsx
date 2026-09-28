import { Link, useLocation, useNavigate } from "react-router";
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
  /** The list the route's search field answers to. */
  destination: Destination;
}

/**
 * The one decision the header makes: which list the search field answers to on
 * this route.
 *
 * The field is on every route now: the two list pages search their own list,
 * and everywhere else — the home and the pages inside a list (see
 * `DrillDownHead`) — it answers to the store, because typing there lands the
 * reader in the store's list, where the results live (the header navigates on
 * the first keystroke; see `AppHeader`). One question, one answer, wherever it
 * is asked from.
 *
 * Pure, so the mapping can be read off directly in a test.
 */
export function headerRoute(pathname: string): HeaderRoute {
  if (pathname === "/installed") return { destination: "installed" };
  return { destination: "store" };
}

/**
 * The app's chrome, one row: the brand and the two destinations at the leading
 * edge, the list's search and the window's settings closing it, and the
 * window's drag region over the lot.
 *
 * One row and no more. It opens with the brand and the segmented navigation
 * (see `AppNav`) — the mark names the window, the control says which of its
 * two lists is on screen — and it closes with the actions. The search field is
 * on every route: on the installed list's own page it filters that list, and
 * anywhere else the first keystroke carries the reader into the store's list,
 * so a search started anywhere ends in the same place with the same answer.
 * Settings stay, because they are the window's and answer on every route.
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
 * `"deep"` covers every descendant, so its empty stretches move the window.
 * Tauri walks up from whatever was clicked, and a clickable element without the
 * attribute — the brand, a button, a link, the search field — stops the walk
 * there, so nothing inside loses its own click.
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const route = headerRoute(pathname);

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
      <Brand />
      <AppNav />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <HeaderSearch
          destination={route.destination}
          onQuery={(query) => {
            setQuery(query);
            // Typing on any page but the installed list's own is a search of
            // the store: carry the reader into the store's list, where the
            // results live. The header sits outside the routed subtree, so
            // this never remounts the field mid-word.
            if (route.destination === "store" && pathname !== "/explore") {
              void navigate("/explore");
            }
          }}
        />
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

/**
 * The list's search field, bound to the shared view (see `lib/list-view`): one
 * field to type in, one query to answer, wherever the reader happens to be.
 * Where each keystroke lands — this list, or the store's — is the header's
 * call (see `AppHeader`).
 *
 * The field stays enabled on the installed list and is locked on the store's
 * until the index over the registry exists: the installed list is already in
 * memory, while a query over a partially downloaded registry would answer
 * wrongly. Routes that search the store (the home, a drill-down) hold the same
 * lock, because the first keystroke lands there.
 */
function HeaderSearch({
  destination,
  onQuery,
}: {
  destination: Destination;
  onQuery: (value: string) => void;
}) {
  const { t } = useTranslation();
  const query = useListQuery();

  // `ready` on its own, so a climbing count never re-renders the header.
  const ready = useRegistrySnapshot((s) => s.ready);
  const waiting = destination === "store" && !ready;

  return (
    <SearchInput
      value={query}
      onChange={onQuery}
      label={t("common.searchSkills")}
      disabled={waiting}
      placeholder={waiting ? t("common.indexBuilding") : undefined}
    />
  );
}
