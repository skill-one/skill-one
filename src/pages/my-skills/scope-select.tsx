import { Check, ChevronsUpDown, Folder, Globe, Plus } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { isSameScope, type SkillScope } from "../../lib/skill-scope";
import { nameFromPath, type Project } from "../../lib/projects";
import { cn } from "../../lib/utils";

/** Human label for the current scope, shown on the card's trigger. */
export function scopeLabel(scope: SkillScope, projects: Project[]): string {
  if (scope.kind === "global") return "全局";
  const project = projects.find((p) => p.path === scope.path);
  return project?.name ?? nameFromPath(scope.path);
}

/**
 * The per-card scope selector: a dropdown showing where the skill is installed
 * now (global or one project) and letting the user move it elsewhere.
 *
 * Choosing 全局 or a project fires `onPick` with the target scope; the page turns
 * that into an actual move (reinstall, or a directory move for source-less
 * skills). "添加项目…" fires `onAddProject`, so a project can be registered
 * without leaving the card. The current location is ticked. `busy` disables the
 * menu while a move is in flight.
 */
export function ScopeSelect({
  scope,
  projects,
  busy,
  onPick,
  onAddProject,
  className,
}: {
  scope: SkillScope;
  projects: Project[];
  busy?: boolean;
  onPick: (target: SkillScope) => void;
  onAddProject: () => void;
  className?: string;
}) {
  const label = scopeLabel(scope, projects);

  const pick = (target: SkillScope) => {
    if (busy || isSameScope(scope, target)) return;
    onPick(target);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          disabled={busy}
          className={cn("max-w-[9rem]", className)}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>安装到</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => pick({ kind: "global" })}>
          <Globe />
          全局
          {scope.kind === "global" && <Check className="ml-auto" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>项目</DropdownMenuLabel>
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.path}
            onSelect={() => pick({ kind: "project", path: project.path })}
          >
            <Folder />
            <span className="truncate">{project.name}</span>
            {scope.kind === "project" && scope.path === project.path && (
              <Check className="ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
        {projects.length === 0 && (
          <DropdownMenuItem disabled>还没有项目</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAddProject}>
          <Plus />
          添加项目…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
