import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Boxes,
  FolderHeart,
  PlusCircle,
  Tags,
  Wrench,
  RefreshCw,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

import { cn } from "../lib/utils";
import { fetchAgentStatus, fetchInstalledSkills } from "../lib/local-skills";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

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

function NavButton({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150 cursor-pointer",
          isActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          collapsed && "justify-center px-0",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <span className="flex-1 truncate text-left">{item.label}</span>
          )}
          {!collapsed && item.count !== undefined && (
            <Badge
              variant={isActive ? "default" : "secondary"}
              className="h-5 min-w-5 justify-center px-1.5 tabular-nums"
            >
              {item.count}
            </Badge>
          )}
        </>
      )}
    </NavLink>
  );
}

function SectionLabel({
  children,
  collapsed,
}: {
  children: React.ReactNode;
  collapsed: boolean;
}) {
  if (collapsed) return null;
  return (
    <p className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

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
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border/70 bg-background transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[60px]" : "w-[232px]",
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Boxes className="h-[18px] w-[18px]" />
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
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <Separator className="mt-1" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-1">
        <SectionLabel collapsed={collapsed}>工作区</SectionLabel>
        {workspaceItems.map((item) => (
          <NavButton key={item.path} item={item} collapsed={collapsed} />
        ))}

        <SectionLabel collapsed={collapsed}>管理中心</SectionLabel>
        {adminItems.map((item) => (
          <NavButton key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/70 p-2">
        <NavLink
          to="/settings"
          title={collapsed ? "设置" : undefined}
          className={({ isActive }) =>
            cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors cursor-pointer",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0",
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>设置</span>}
        </NavLink>
      </div>
    </aside>
  );
}
