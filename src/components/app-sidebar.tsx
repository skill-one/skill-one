import { NavLink, useLocation } from "react-router";
import { Settings, Sparkles, GitFork, LayoutGrid, Boxes } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "./ui/sidebar";
import { Badge } from "./ui/badge";
import { isTauri } from "../lib/tauri";
import { useAppUpdate } from "../hooks/use-app-update";
import { useInstalledSkills } from "../hooks/use-installed-skills";
import { useRegistryRepos } from "../hooks/use-registry-repos";
import { useRegistrySnapshot } from "../hooks/use-registry-snapshot";

export interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * "prefix" keeps the item active for its sub-routes too (e.g. 精选 stays
   * highlighted on a leaderboard page). Only opt in where the item owns a
   * page family — a plain startsWith would light up 全部 for every /explore/*
   * path, since /explore is a prefix of them.
   */
  match?: "exact" | "prefix";
}

export const shopItems: NavItem[] = [
  {
    path: "/explore/featured",
    label: "精选",
    icon: Sparkles,
    match: "prefix",
  },
  { path: "/explore/repos", label: "仓库", icon: GitFork },
  { path: "/explore", label: "全部", icon: LayoutGrid },
];

export const mySkillsItems: NavItem[] = [
  { path: "/my-skills", label: "我的 skills", icon: Boxes },
];

export const footerItems: NavItem[] = [
  { path: "/settings", label: "设置", icon: Settings },
];

/**
 * Real badge counts: Shop "全部" = registry total, "仓库" = aggregated repo
 * total, "My Skills → 全局" = installed skill count. Pages without a count
 * source (精选) show no badge. The badge is not rendered while its
 * data is loading, avoiding a flash of 0.
 *
 * The registry count is progressive: it mirrors the registry worker's
 * progress count, so it reports the skills parsed so far and climbs as the
 * ~12MB download proceeds, settling on the registry size once the stream
 * completes. It renders as a plain number — no progress decoration.
 *
 * The repos count is the opposite: it reuses the repos page's aggregation,
 * whose query only runs once the whole index has landed — a repo count
 * computed over a partial download is simply wrong.
 */
function useNavCounts(): Partial<Record<string, number>> {
  // Progress flags and identity changes (index/epoch/ready transitions) never
  // touch the badge, so only the count and the failure flag are subscribed.
  const count = useRegistrySnapshot((s) => s.count);
  const error = useRegistrySnapshot((s) => s.error);
  const { data: installedSkills } = useInstalledSkills();
  // A single-row page fetch: only `total` is of interest here.
  const { data: reposPage } = useRegistryRepos("", "stars", 0, 1);
  const repoTotal = reposPage?.total ?? 0;
  return {
    // Hidden while nothing has loaded yet and on a failed download: an empty
    // registry is not a meaningful count to advertise.
    "/explore": error == null && count > 0 ? count : undefined,
    "/explore/repos": repoTotal > 0 ? repoTotal : undefined,
    "/my-skills": installedSkills?.length,
  };
}

function NavMenuItem({
  item,
  count,
  indicator,
}: {
  item: NavItem;
  count?: number;
  /**
   * Trailing mark in the same slot as `count`. The two never coexist — a row
   * either counts things or flags one — so passing both is a caller bug.
   */
  indicator?: React.ReactNode;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === item.path ||
    (item.match === "prefix" &&
      location.pathname.startsWith(`${item.path}/`));
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <NavLink to={item.path}>
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
      {count !== undefined && (
        <SidebarMenuBadge className="tabular-nums">{count}</SidebarMenuBadge>
      )}
      {indicator !== undefined && (
        <SidebarMenuBadge>{indicator}</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/**
 * The whole in-sidebar update affordance: one chip on 设置, in the slot the
 * other rows use for their counts — and the chip itself is the way in.
 *
 * Marking an icon the user already knows — rather than adding a row of its own
 * — is how the desktop apps this one lives next to do it: VS Code badges the
 * Settings gear, Chrome badges the ⋮ menu, Slack badges the workspace. VS Code
 * went as far as fixing a bug where the gear badge *and* its "Update" button
 * showed at once, on the grounds that two signals for one fact is noise.
 *
 * Clicking it opens the confirmation dialog from wherever the user is, so
 * nobody has to know the update is filed under settings. It says its piece
 * instead of being a bare dot — this sidebar's other badge is a plain count,
 * where a silent dot reads as decoration — and it is the only coloured thing
 * in the footer, which is what makes it read as an action among numbers. Green
 * (`success`) rather than the palette's red: an available update is something
 * to go and get, not a failure, and red would say the app is broken.
 */
function UpdateBadge() {
  const { open } = useAppUpdate();
  return (
    <Badge asChild variant="success">
      <button
        type="button"
        onClick={() => open()}
        // The badge slot is `pointer-events-none` so it never swallows clicks
        // meant for the row; this one is a button and wants them.
        className="pointer-events-auto cursor-pointer"
      >
        有新版本
      </button>
    </Badge>
  );
}

function BrandHeader() {
  return (
    <SidebarHeader>
      {/* Reserve the macOS traffic-light zone (Overlay title bar) and make
          it draggable so the window can be moved from the sidebar top. */}
      {isTauri() && <div data-tauri-drag-region className="h-6 shrink-0" />}
      <div className="flex items-center gap-2.5 px-1 py-2">
        <img
          src="/skill-one-transparent.png"
          alt=""
          className="size-8 shrink-0 object-contain"
        />
        <span className="text-[14px] font-semibold text-foreground">
          Skill One
        </span>
      </div>
    </SidebarHeader>
  );
}

export function AppSidebar() {
  const counts = useNavCounts();
  const { phase, version } = useAppUpdate();
  // A discovered update is marked on 设置 itself (see UpdateBadge) instead of
  // getting a row of its own.
  const hasUpdate = phase === "available" && version !== null;
  return (
    <Sidebar collapsible="none">
      <BrandHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>商店</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {shopItems.map((item) => (
                <NavMenuItem
                  key={item.label}
                  item={item}
                  count={counts[item.path]}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mySkillsItems.map((item) => (
                <NavMenuItem
                  key={item.label}
                  item={item}
                  count={counts[item.path]}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          {footerItems.map((item) => (
            <NavMenuItem
              key={item.label}
              item={item}
              indicator={hasUpdate ? <UpdateBadge /> : undefined}
            />
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
