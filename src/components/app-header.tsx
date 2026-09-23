import { Link, NavLink, useLocation } from "react-router";
import { ArrowLeft, Boxes, LayoutGrid } from "lucide-react";

import { cn } from "../lib/utils";
import { isTauri } from "../lib/tauri";
import { useReturn } from "../hooks/use-return";
import { ListToolbar } from "./list-toolbar";
import { SettingsMenu } from "./settings-popover";
import type { Destination } from "../lib/list-view";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The app's two destinations: the store, and the installed skills. */
const navItems: NavItem[] = [
  { path: "/explore", label: "商店", icon: LayoutGrid },
  { path: "/my-skills", label: "我的 skills", icon: Boxes },
];

/** What a route puts in the header's middle slot. */
export interface HeaderRoute {
  /** The list this route shows, when it shows one. */
  destination?: Destination;
  /** A drill-down's way back: where it points with nothing behind it, and what
   * it says. */
  back?: { fallback: string; label: string };
}

/**
 * The one decision the header makes: which route is on screen, and what its
 * middle slot therefore holds.
 *
 * Every route either shows a list — and then the slot holds that list's
 * controls — or is a page inside one, and then it holds the way back. That is
 * the whole reason the slot swaps instead of the pages rendering a bar of their
 * own: there is one row above the content, and it says what the current page is
 * and what can be done to it, wherever the reader is.
 *
 * Pure, so the mapping can be read off directly in a test.
 */
export function headerRoute(pathname: string): HeaderRoute {
  if (pathname === "/explore") return { destination: "store" };
  if (pathname === "/my-skills") return { destination: "installed" };
  if (pathname.startsWith("/repo/")) {
    return { back: { fallback: "/explore", label: "返回商店" } };
  }
  if (pathname === "/my-skills/local") {
    return { back: { fallback: "/my-skills", label: "返回我的 skills" } };
  }
  return {};
}

/**
 * The app's whole chrome: one row holding the brand, the two destinations, the
 * current page's controls, and settings.
 *
 * The window runs `titleBarStyle: "Overlay"`, so macOS draws its traffic lights
 * over this row instead of in a title bar of its own. Two consequences shape the
 * markup: the row reserves the lights' corner with left padding, and it is the
 * `data-tauri-drag-region` — with no sidebar down the window edge, this row is
 * what keeps the window movable. Only the elements carrying the attribute drag
 * (Tauri checks the event target, not its ancestors), so the controls inside
 * stay clickable.
 *
 * The inner container repeats the content area's own grid — same maximum width,
 * same horizontal padding — so the header's right edge lines up with the lists'
 * right edge. On macOS the left edge cannot line up, because the traffic lights
 * sit where the content's padding would be; the padding is what gives way.
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const route = headerRoute(pathname);
  const back = useReturn(route.back?.fallback ?? "/explore");

  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center border-b border-border bg-background"
    >
      <div
        data-tauri-drag-region
        className={cn(
          "mx-auto flex w-full max-w-[1400px] items-center gap-3 pr-8",
          isTauri() ? "pl-20" : "pl-8",
        )}
      >
        <Brand />
        <NavSwitcher />
        <div className="flex min-w-0 flex-1 items-center gap-3">
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
              {route.back.label}
            </Link>
          )}
        </div>
        <SettingsMenu />
      </div>
    </header>
  );
}

/** The brand mark: a logo and the word, at rest — not a link to anywhere. */
function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-2 px-1">
      <img
        src="/skill-one-transparent.png"
        alt=""
        className="size-6 shrink-0 object-contain"
      />
      <span className="text-[14px] font-semibold text-foreground">
        Skill One
      </span>
    </div>
  );
}

/**
 * The two destinations as a segmented switcher, styled after shadcn/ui's Tabs
 * look (muted track, raised active pill) while staying plain links: these are
 * pages to navigate to, not in-place panels, so the destination lives in the
 * URL and the browser's own back button works on it.
 *
 * React Router's default prefix matching keeps a destination lit on its
 * sub-pages, which is what a sub-page should say: a repository page is still
 * the store, and the installed list's local pool is still 我的 skills.
 */
function NavSwitcher() {
  return (
    <nav
      aria-label="主导航"
      className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
