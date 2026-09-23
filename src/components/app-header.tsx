import { NavLink } from "react-router";
import { Boxes, LayoutGrid } from "lucide-react";

import { cn } from "../lib/utils";
import { isTauri } from "../lib/tauri";
import { SettingsMenu } from "./settings-popover";

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

/**
 * The app's whole navigation: one top bar holding the brand, the two
 * destinations as a segmented switcher, and the settings entry at the far edge.
 *
 * The window runs `titleBarStyle: "Overlay"`, so macOS draws its traffic lights
 * over this bar instead of in a title bar of its own. Two consequences shape
 * the markup: the bar reserves the lights' corner with left padding, and it is
 * itself the `data-tauri-drag-region` — with no sidebar running down the window
 * edge, this bar is what keeps the window movable. Only the bar's own surface
 * drags: the links and the button inside it are targets of their own, so
 * pressing them navigates instead of moving the window.
 */
export function AppHeader() {
  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3",
        isTauri() && "pl-20",
      )}
    >
      <Brand />
      <NavSwitcher />
      <div className="ml-auto flex items-center gap-1.5">
        <SettingsMenu />
      </div>
    </header>
  );
}

/** The brand mark: a logo and the word, at rest — not a link to anywhere. */
function Brand() {
  return (
    <div className="flex items-center gap-2 px-1">
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
      className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
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
