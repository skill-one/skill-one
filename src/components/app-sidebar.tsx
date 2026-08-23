import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Boxes,
  FolderHeart,
  PanelLeft,
  PanelLeftClose,
  PlusCircle,
  RefreshCw,
  Settings,
  Tags,
  Wrench,
} from "lucide-react";

import { fetchAgentStatus, fetchInstalledSkills } from "../lib/local-skills";
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
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "./ui/sidebar";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

const adminItems: NavItem[] = [
  { path: "/tags", label: "标签", icon: Tags, count: 0 },
  { path: "/tools", label: "工具", icon: Wrench, count: 46 },
  { path: "/updates", label: "更新", icon: RefreshCw, count: 0 },
];

function NavMenuItem({ item }: { item: NavItem }) {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const isActive = location.pathname === item.path;
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <NavLink to={item.path}>
          <Icon />
          {!collapsed && <span>{item.label}</span>}
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
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarHeader>
      <div className="flex items-center gap-2.5 px-1 py-1.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm group-data-[collapsible=icon]:hidden">
          <Boxes className="size-[18px]" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
              Skillone
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              技能同步工作台
            </p>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>
    </SidebarHeader>
  );
}

export function AppSidebar() {
  // Live counts for the workspace badges (hidden while the queries load).
  const { data: installedSkills } = useQuery({
    queryKey: ["installed-skills"],
    queryFn: fetchInstalledSkills,
    staleTime: 0,
  });
  const { data: agents } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    staleTime: 0,
  });

  const workspaceItems: NavItem[] = [
    {
      path: "/my-skills",
      label: "我的 Skills",
      icon: FolderHeart,
      count: installedSkills ? installedSkills.length : undefined,
    },
    {
      path: "/my-agents",
      label: "我的 Agents",
      icon: Bot,
      count: agents ? agents.length : undefined,
    },
    { path: "/explore", label: "添加 Skills", icon: PlusCircle },
  ];

  return (
    // The shadcn sidebar is viewport-fixed; offset it below the 52px title bar.
    <Sidebar collapsible="icon" style={{ top: 52, height: "auto" }}>
      <BrandHeader />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作区</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => (
                <NavMenuItem key={item.path} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>管理中心</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <NavMenuItem key={item.path} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <NavMenuItem item={{ path: "/settings", label: "设置", icon: Settings }} />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
