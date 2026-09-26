import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";

import { cn } from "../lib/utils";

interface NavItem {
  /** Where the entry leads. */
  path: string;
  /** i18n key of the entry's name. */
  labelKey: ParseKeys;
  /**
   * Every route prefix this destination owns: its own list, and the pages a
   * drill-down hangs off it. The store needs two — a repository's page is
   * `/repo/owner/name`, which shares no prefix with `/explore` — and that is
   * why the active state is computed here rather than left to `NavLink`.
   */
  owns: readonly string[];
}

/**
 * The app's two destinations: the store, and the installed skills.
 */
const navItems: NavItem[] = [
  {
    path: "/explore",
    labelKey: "nav.store",
    owns: ["/explore", "/repo"],
  },
  {
    path: "/my-skills",
    labelKey: "nav.my",
    owns: ["/my-skills"],
  },
];

/** Whether a path is one of `roots`, or a page under one. */
function belongsTo(roots: readonly string[], pathname: string): boolean {
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/**
 * The app's navigation: the two destinations as one segmented control in the
 * window's header, beside the brand.
 *
 * Two destinations is the case this shape is for: a persistent side rail
 * earns its column from four or more peer places or a hierarchy, while macOS
 * puts a small, fixed set of peer panes in a segmented control in the toolbar
 * (the toolbar style of `NSTabViewController`). The freed column goes to the
 * list, which is what this window exists to show.
 *
 * Links rather than a toggle group: these are places, with history and a
 * reader who can arrive on a page inside one — so the active state says
 * `aria-current="page"` over a route *family* (see `owns`) instead of a
 * pressed button. The words are the whole label: the two names are short and
 * distinct, so the segments need no marks beside them. The active segment is
 * raised from the track (background against the muted bed, one quiet shadow)
 * — the segmented control's own way of saying which pane is on screen.
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
 * One destination: its name, raised while the reader is anywhere in it — the
 * list itself, or a page inside it. A plain `Link` rather than a `NavLink`
 * because the active state is the route *family* above, which `NavLink`
 * cannot know; `aria-current` is set by hand to say the same thing to
 * assistive tech.
 */
function NavSegment({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isActive = belongsTo(item.owns, pathname);

  return (
    <Link
      to={item.path}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex h-7 items-center rounded-md px-3 text-[13px] font-medium transition-colors",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="whitespace-nowrap">{t(item.labelKey)}</span>
    </Link>
  );
}
