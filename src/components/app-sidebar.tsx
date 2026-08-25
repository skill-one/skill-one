import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
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
import { fetchInstalledSkills } from "../lib/local-skills";
import { fetchSkillsPage } from "../lib/skills-api";

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

/** 全部导航项：侧边栏与标题栏共用同一份页面标题。 */
export const navItems: NavItem[] = [
  ...shopItems,
  ...mySkillsItems,
  ...footerItems,
];

/** 按路由路径查找侧边栏页面标题；未知路径返回空串。 */
export function navLabelFor(path: string): string {
  return navItems.find((item) => item.path === path)?.label ?? "";
}

/**
 * 侧边栏徽标的真实数字：商店「全部」= 注册表总量，「我的 Skills → 全局」=
 * 已安装技能数量。仅这两个入口有对应的真实数据源；精选/官方/项目等未实现
 * 页面不显示数字。数据未加载完成时不渲染徽标，避免闪现 0。
 */
function useNavCounts(): Partial<Record<string, number>> {
  const { data: registryTotal } = useQuery({
    queryKey: ["skills-total"],
    queryFn: async () => {
      const page = await fetchSkillsPage(0);
      return page.total;
    },
  });
  const { data: installedSkills } = useQuery({
    queryKey: ["installed-skills"],
    queryFn: fetchInstalledSkills,
  });
  return {
    "/explore": registryTotal ?? undefined,
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
          skillone
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
