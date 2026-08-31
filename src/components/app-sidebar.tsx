import { NavLink, useLocation } from "react-router";
import {
  Settings,
  Sparkles,
  Building2,
  LayoutGrid,
  Globe,
  Folder,
} from "lucide-react";

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
import { isTauri } from "../lib/tauri";
import { useInstalledSkills } from "../hooks/use-installed-skills";
import { useRegistryStats } from "../hooks/use-registry-stats";

export interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const shopItems: NavItem[] = [
  { path: "/explore/featured", label: "精选", icon: Sparkles },
  { path: "/explore/official", label: "官方", icon: Building2 },
  { path: "/explore", label: "全部", icon: LayoutGrid },
];

export const mySkillsItems: NavItem[] = [
  { path: "/my-skills", label: "全局", icon: Globe },
  { path: "/my-skills/project", label: "项目", icon: Folder },
];

export const footerItems: NavItem[] = [
  { path: "/settings", label: "设置", icon: Settings },
];

/**
 * Real badge counts: Shop "全部" = registry total, "My Skills → 全局" =
 * installed skill count. Only these two entries have a real data source;
 * unimplemented pages (featured / official / project) show no badge. The
 * badge is not rendered while its data is loading, avoiding a flash of 0.
 *
 * The registry count is progressive: it mirrors the registry worker's
 * progress count, so it reports the skills parsed so far and climbs as the
 * ~12MB download proceeds, settling on the registry size once the stream
 * completes. It renders as a plain number — no progress decoration.
 */
function useNavCounts(): Partial<Record<string, number>> {
  const stats = useRegistryStats();
  const { data: installedSkills } = useInstalledSkills();
  return {
    // Hidden while nothing has loaded yet and on a failed download: an empty
    // registry is not a meaningful count to advertise.
    "/explore":
      stats.error == null && stats.count > 0 ? stats.count : undefined,
    "/my-skills": installedSkills?.length,
  };
}

function NavMenuItem({ item, count }: { item: NavItem; count?: number }) {
  const location = useLocation();
  const isActive = location.pathname === item.path;
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
    </SidebarMenuItem>
  );
}

function BrandHeader() {
  return (
    <SidebarHeader>
      {/* Reserve the macOS traffic-light zone (Overlay title bar) and make
          it draggable so the window can be moved from the sidebar top. */}
      {isTauri() && <div data-tauri-drag-region className="h-6 shrink-0" />}
      <div className="flex items-center gap-2.5 px-1 py-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold shadow-sm">
          S
        </div>
        <span className="text-[14px] font-semibold text-foreground">
          Skill One
        </span>
      </div>
    </SidebarHeader>
  );
}

export function AppSidebar() {
  const counts = useNavCounts();
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
          <SidebarGroupLabel>我的SKILLS</SidebarGroupLabel>
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
            <NavMenuItem key={item.label} item={item} />
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
