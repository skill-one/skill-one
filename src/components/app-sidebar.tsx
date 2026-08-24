import { NavLink, useLocation } from "react-router-dom";
import {
  Search,
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
import { Input } from "./ui/input";
import { isTauri } from "../lib/tauri";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

const shopItems: NavItem[] = [
  { path: "/explore/featured", label: "精选", icon: Sparkles, count: 12 },
  { path: "/explore/official", label: "官方", icon: Building2, count: 12 },
  { path: "/explore", label: "全部", icon: LayoutGrid, count: 12 },
];

const mySkillsItems: NavItem[] = [
  { path: "/my-skills", label: "全局", icon: Globe, count: 3 },
  { path: "/my-skills/project", label: "项目", icon: Folder, count: 3 },
];

function NavMenuItem({ item }: { item: NavItem }) {
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
      {item.count !== undefined && (
        <SidebarMenuBadge className="tabular-nums">
          {item.count}
        </SidebarMenuBadge>
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
          SkillOne
        </span>
      </div>
      <div className="px-1 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="搜索 Skill" className="h-8 pl-8 text-[12px]" />
        </div>
      </div>
    </SidebarHeader>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="none">
      <BrandHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>商店</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {shopItems.map((item) => (
                <NavMenuItem key={item.label} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>我的SKILLS</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mySkillsItems.map((item) => (
                <NavMenuItem key={item.label} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <NavMenuItem
            item={{ path: "/settings", label: "设置", icon: Settings }}
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
