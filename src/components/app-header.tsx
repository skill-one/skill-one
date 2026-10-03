import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { cn } from "../lib/utils";
import { isTauri } from "../lib/tauri";
import { AppNav } from "./app-nav";
import { SearchInput } from "./search-input";
import { SettingsMenu } from "./settings-menu";

/** The search page's own route: one question, asked of every collection at once. */
export const SEARCH_PATH = "/search";

/** The query parameter that question is carried in. */
export const SEARCH_QUERY_PARAM = "q";

/**
 * Where a question asked from anywhere in the app is answered.
 *
 * Built as a path rather than a route with a state, because the question has
 * to be shareable and the back button has to be the way out of it — which means
 * it has to be in the URL (see `SearchPage`, which reads this parameter).
 */
export function searchPath(query: string): string {
  return `${SEARCH_PATH}?${SEARCH_QUERY_PARAM}=${encodeURIComponent(query)}`;
}

/**
 * The app's chrome, one row: the destinations at the leading edge, the brand
 * dead centre and the window's settings closing it, with the window's drag
 * region over the lot.
 *
 * One row and no more, and nothing in it that belongs to a page — except the
 * search field, which belongs to the window because it answers on every route:
 * it is a jump pad into the search page from anywhere, and the question it holds
 * there is the URL's (see `searchPath`). The row opens with the segmented
 * navigation (see `AppNav`) — the control says which of its lists is on screen —
 * closes with the actions, and carries the mark in the middle, the way a unified
 * toolbar's title does. Settings stay, because they are the window's and answer on
 * every route. Everything else a list needs belongs to that list: the scope picker
 * and the sort switch stand on the list's own row above the answer they shape
 * (see `ListToolbar`). The leading edge is kept clear of the lights by the padding
 * (`pl-24`: the native 20pt leading inset + 52pt of buttons + air), so on macOS
 * the navigation starts just past them, the way a unified toolbar's items do.
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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const onSearchPage = pathname === SEARCH_PATH;

  // A browse page holds no question, so its field is a local draft: without one,
  // the controlled empty value would reset the DOM mid-word on the very
  // navigation the first keystroke triggers, dropping fast keystrokes.
  const [draft, setDraft] = useState("");
  useEffect(() => {
    // The URL owns the question on the search page; drop whatever draft the
    // jump pad held, so a later return to a browse page starts empty. Clearing
    // only on the search page's own commits matters: an intermediate browse
    // commit still in flight must not clobber the draft its navigation carries.
    // The functional update keeps this a no-op (no extra render) once empty.
    if (pathname === SEARCH_PATH) setDraft((d) => (d === "" ? d : ""));
  }, [pathname]);

  // The field mirrors the URL's question on the search page and the draft
  // everywhere else: a browse page holds no question, so leaving the search page
  // (a destination, the back button) reads as leaving the search.
  const value = onSearchPage
    ? (searchParams.get(SEARCH_QUERY_PARAM) ?? "")
    : draft;

  // The header sits outside the routed subtree, so navigating here never remounts
  // the field mid-word. The first keystroke pushes the search page (so back returns
  // to the browse page); the rest — and every edit on the search page itself —
  // replace in place, so typing does not spam the history with one entry per
  // letter.
  const onQuery = (next: string) => {
    if (onSearchPage) {
      setSearchParams(
        next ? { [SEARCH_QUERY_PARAM]: next } : {},
        { replace: true },
      );
      return;
    }
    setDraft(next);
    if (!next) return;
    if (draft === "") void navigate(searchPath(next));
    else void navigate(searchPath(next), { replace: true });
  };

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
          asymmetry cannot drag it off the window's centre.

          `pointer-events-none` because this wrapper is `inset-0` — it spans the
          whole header, not just the mark — and it paints after the nav, so
          without this it swallows every click meant for the nav links. The mark
          itself opts back in below, since it is a link home. jsdom has no
          pointer-event hit testing, so only the end-to-end suite can see this. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Brand />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <HeaderSearch value={value} onQuery={onQuery} />
        <SettingsMenu />
      </div>
    </header>
  );
}

/**
 * The search field: a jump pad into the search page on every route, the page's
 * own question editor on the search page itself.
 *
 * The field never locks: the installed answer is memory and lands first, and the
 * store's and live sections hold their places with skeletons while their answers
 * are in flight — so a question typed before the index is ready waits for its
 * answer instead of being refused.
 */
function HeaderSearch({
  value,
  onQuery,
}: {
  value: string;
  /** Receives the raw field value; debouncing is the search page's. */
  onQuery: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <SearchInput
      className="w-64"
      value={value}
      onChange={onQuery}
      label={t("common.searchSkills")}
    />
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
      // Opts back into the pointer events its wrapper opts out of, so the mark
      // stays a link home while the rest of the header it overlays does not
      // intercept anything.
      className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
