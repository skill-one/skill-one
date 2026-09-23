import { NavLink, useLocation } from "react-router";
import { LayoutGrid, Boxes } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "./ui/sidebar";
import { SettingsMenuItem } from "./settings-popover";
import { isTauri } from "../lib/tauri";
import { useInstalledSkills } from "../hooks/use-installed-skills";
import { useRegistrySnapshot } from "../hooks/use-registry-snapshot";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The sidebar's two destinations: the store, and the installed skills. */
const navItems: NavItem[] = [
  { path: "/explore", label: "商店", icon: LayoutGrid },
  { path: "/my-skills", label: "我的 skills", icon: Boxes },
];

/**
 * Real badge counts: 商店 = registry total, 我的 skills = installed skill
 * count. A badge is not rendered while its data is loading, avoiding a flash
 * of 0.
 *
 * The registry count is progressive: it mirrors the registry worker's
 * progress count, so it reports the skills parsed so far and climbs as the
 * ~12MB download proceeds, settling on the registry size once the stream
 * completes. It renders as a plain number — no progress decoration.
 */
function useNavCounts(): Partial<Record<string, number>> {
  // Progress flags and identity changes (index/epoch/ready transitions) never
  // touch the badge, so only the count and the failure flag are subscribed.
  const count = useRegistrySnapshot((s) => s.count);
  const error = useRegistrySnapshot((s) => s.error);
  const { data: installedSkills } = useInstalledSkills();
  return {
    // Hidden while nothing has loaded yet and on a failed download: an empty
    // registry is not a meaningful count to advertise.
    "/explore": error == null && count > 0 ? count : undefined,
    "/my-skills": installedSkills?.length,
  };
}

function NavMenuItem({
  item,
  count,
}: {
  item: NavItem;
  count?: number;
}) {
  const location = useLocation();
  const isActive = location.pathname === item.path;
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={item.label}
        render={
          <NavLink to={item.path}>
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        }
      />
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
  return (
    <Sidebar>
      <BrandHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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
          <SettingsMenuItem />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
