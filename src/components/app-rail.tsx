import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { PackageCheck, Store } from "lucide-react";

import { cn } from "../lib/utils";
import { SettingsMenu } from "./settings-popover";

interface NavItem {
  /** Where the entry leads. */
  path: string;
  /** i18n key of the entry's name. */
  labelKey: ParseKeys;
  icon: React.ComponentType<{ className?: string }>;
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
 *
 * The pair is one metaphor — the shop and the things taken home from it — which
 * is why the marks are two halves of it rather than two abstract shapes: a
 * storefront for where they come from, a checked parcel for what is on this
 * machine. Distinct in silhouette too (awning and door under a roof, a square
 * box), so the two tiles are told apart at 20px without reading the names.
 */
const navItems: NavItem[] = [
  {
    path: "/explore",
    labelKey: "nav.store",
    icon: Store,
    owns: ["/explore", "/repo"],
  },
  {
    path: "/my-skills",
    labelKey: "nav.my",
    icon: PackageCheck,
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
 * The app's navigation: a narrow rail down the left edge, one icon and one small
 * name per destination, with settings at the foot.
 *
 * Narrow because there are two destinations and a column spent on two words is a
 * column spent on every window; named anyway, because two bare icons would leave
 * the reader hovering to find out which list they are looking at. The names are
 * as short as the meaning survives — 商店 and 我的, the pair the icons already
 * sketch — because they have to fit the column, not the page they lead to.
 *
 * The rail holds navigation and nothing else. The brand and the list controls
 * are the header's, which is also where the window's drag region and the macOS
 * traffic lights live — so this column starts at the window's top edge and runs
 * the full height beside the content.
 */
export function AppRail() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("nav.mainAria")}
      className="flex w-[var(--rail-w)] shrink-0 flex-col items-center border-r border-border bg-background"
    >
      <div className="flex w-full flex-col items-center gap-1 px-1.5 pt-2">
        {navItems.map((item) => (
          <RailLink key={item.path} item={item} />
        ))}
      </div>
      <div className="mt-auto flex w-full flex-col items-center gap-1 px-1.5 pb-2">
        <SettingsMenu />
      </div>
    </nav>
  );
}

/**
 * One destination: its icon over its name, on a filled tile while the reader is
 * anywhere in it — the list itself, or a page inside it. A plain `Link` rather
 * than a `NavLink` because the active state is the route *family* above, which
 * `NavLink` cannot know; `aria-current` is set by hand to say the same thing to
 * assistive tech.
 */
function RailLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isActive = belongsTo(item.owns, pathname);
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors",
        isActive
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] leading-none whitespace-nowrap">
        {t(item.labelKey)}
      </span>
    </Link>
  );
}
