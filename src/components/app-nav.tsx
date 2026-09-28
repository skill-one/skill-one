import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { House, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface NavItem {
  /** Where the entry leads. */
  path: string;
  /** i18n key of the entry's name. */
  labelKey: ParseKeys;
  /** A mark instead of a word, for the one entry that names a role, not a list. */
  icon?: LucideIcon;
  /**
   * Every route prefix this destination owns: its own list, and the pages a
   * drill-down hangs off it. The store needs two — a repository's page is
   * `/repo/owner/name`, which shares no prefix with `/explore` — and that is
   * why the active state is computed here rather than left to `NavLink`.
   */
  owns: readonly string[];
}

/**
 * The app's three destinations: the home (the agents graph), the store, and the
 * installed skills.
 */
const navItems: NavItem[] = [
  {
    path: "/",
    labelKey: "nav.home",
    icon: House,
    // The home owns only itself: `belongsTo` matches an exact root or a
    // `${root}/` prefix, and no real path begins `//`, so this never claims
    // `/explore` or `/installed`.
    owns: ["/"],
  },
  {
    path: "/explore",
    labelKey: "nav.store",
    owns: ["/explore", "/repo"],
  },
  {
    path: "/installed",
    labelKey: "nav.installed",
    owns: ["/installed"],
  },
];

/** Whether a path is one of `roots`, or a page under one. */
function belongsTo(roots: readonly string[], pathname: string): boolean {
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/**
 * The app's navigation: the three destinations as one segmented control in the
 * window's header, beside the brand.
 *
 * A small, fixed set of peer places is the case this shape is for: macOS puts
 * them in a toolbar segmented control (the toolbar style of
 * `NSTabViewController`), while a persistent side rail earns its column from
 * four or more peer places or a hierarchy — and the freed column goes to the
 * list, which is what this window exists to show.
 *
 * Every top-level place is here, the home included: a reader must be able to
 * see which one is on screen and reach any other, so the home cannot be left to
 * the brand alone. Two entries are named by their word (商店 · 已安装); the home
 * is a mark, because its word would name a role rather than a place and a
 * compact mark keeps the row short — the word rides its accessible name and
 * hover tip instead, the arrangement `DrillDownHead` uses for the same reason.
 *
 * Links rather than a toggle group: these are places, with history and a reader
 * who can arrive on a page inside one — so the active state says
 * `aria-current="page"` over a route *family* (see `owns`) instead of a pressed
 * button. The active segment is raised from the track (background against the
 * muted bed, one quiet shadow) — the segmented control's own way of saying
 * which pane is on screen.
 */
export function AppNav() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("nav.mainAria")}
      className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {navItems.map((item) => (
        <NavSegment key={item.path} item={item} />
      ))}
    </nav>
  );
}

/**
 * One destination: its mark or its name, raised while the reader is anywhere in
 * it — the list itself, or a page inside it. A plain `Link` rather than a
 * `NavLink` because the active state is the route *family* above, which
 * `NavLink` cannot know; `aria-current` is set by hand to say the same thing to
 * assistive tech.
 */
function NavSegment({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isActive = belongsTo(item.owns, pathname);

  const className = cn(
    "flex h-7 items-center rounded-md text-[13px] font-medium transition-colors",
    item.icon ? "px-2" : "px-3",
    isActive
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

  if (item.icon) {
    const Icon = item.icon;
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to={item.path}
              aria-current={isActive ? "page" : undefined}
              aria-label={t(item.labelKey)}
              className={className}
            />
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">{t(item.labelKey)}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      to={item.path}
      aria-current={isActive ? "page" : undefined}
      className={className}
    >
      <span className="whitespace-nowrap">{t(item.labelKey)}</span>
    </Link>
  );
}
