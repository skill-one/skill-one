import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import {
  moveSkill,
  removeInstalledSkill,
  setSkillEnabled,
} from "../../lib/local-skills";
import { type Project } from "../../lib/projects";
import { type SkillScope } from "../../lib/skill-scope";
import {
  markSkillsChanged,
  useInstalledSkills,
  type ScopedInstalledSkill,
} from "../../hooks/use-installed-skills";
import { useProjects } from "../../hooks/use-projects";
import { useProjectAdd } from "../../hooks/use-project-add";
import { useRegistrySkillMeta } from "../../hooks/use-registry-skill-meta";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import type { SkillRef } from "../../lib/registry/protocol";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { ScopeSelect } from "./scope-select";
import { AddProjectDialog } from "../../components/add-project-dialog";
import { OwnerAvatar } from "../../components/owner-avatar";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import { ListPager } from "../../components/list-pager";
import { Switch } from "../../components/ui/switch";
import { cn } from "../../lib/utils";

/** Skills shown per page; same rhythm as the store's full list. */
const PAGE_SIZE = 24;

/** Keystrokes settle this long before the local list is filtered. */
const SEARCH_DEBOUNCE_MS = 150;

/** Enablement filter offered by the toolbar dropdown. */
type EnabledFilter = "all" | "enabled" | "disabled";

/** Scope filter: every skill, or only the global / project ones. */
type ScopeFilter = "all" | "global" | "project";

const ENABLE_OPTIONS: Array<{ value: EnabledFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "已启用" },
  { value: "disabled", label: "已禁用" },
];

const SCOPE_OPTIONS: Array<{ value: ScopeFilter; label: string }> = [
  { value: "all", label: "全部范围" },
  { value: "global", label: "全局" },
  { value: "project", label: "项目" },
];

/** Stable identity for a row: a skill's name is only unique within its scope. */
function rowId(skill: Pick<ScopedInstalledSkill, "name" | "scopeKey">): string {
  const { kind, path } =
    skill.scopeKey.kind === "project"
      ? { kind: "project" as const, path: skill.scopeKey.path }
      : { kind: "global" as const, path: "" };
  return `${kind}|${path}|${skill.name}`;
}

function sourceLabelFor(skill: ScopedInstalledSkill): string {
  // No source record (e.g. placed manually into the global directory) or an
  // explicit local source both mean this is a local skill.
  if (!skill.sourceType || skill.sourceType === "local") return "本地";
  return skill.source || skill.sourceType || "本地";
}

function SkillCardItem({
  skill,
  projects,
  enabled,
  removing,
  moving,
  description,
  onToggle,
  onRemove,
  onMove,
  onAddProject,
}: {
  skill: ScopedInstalledSkill;
  projects: Project[];
  enabled: boolean;
  removing: boolean;
  moving: boolean;
  description: string;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onMove: (target: SkillScope) => void;
  onAddProject: () => void;
}) {
  return (
    <div
      data-skill={skill.name}
      className={cn(
        "relative rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-border hover:shadow-[0_6px_20px_-12px_rgba(15,23,42,0.15)]",
        !enabled && "opacity-60",
      )}
    >
      {/* Top: avatar + name + source; the right side stays empty for the toggle in the top-right corner. */}
      <div className="flex items-start gap-3 pr-12">
        {skill.sourceType !== "local" && skill.source?.includes("/") ? (
          <OwnerAvatar
            owner={skill.source.split("/")[0]}
            className="h-10 w-10 text-[16px]"
          />
        ) : (
          <div
            aria-label="skill 头像"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground"
          >
            <Puzzle className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 pt-1.5">
          <h3
            className={cn(
              "truncate text-[14px] font-semibold",
              enabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {skill.name}
          </h3>
          <p
            className={cn(
              "mt-0.5 truncate text-[12px]",
              enabled ? "text-muted-foreground" : "text-muted-foreground/70",
            )}
          >
            {sourceLabelFor(skill)}
          </p>
        </div>
      </div>

      {/* Top-right corner: enable toggle */}
      <div className="absolute right-4 top-4">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`${enabled ? "关闭" : "开启"} ${skill.name}`}
        />
      </div>

      {/* Description: the disk-extracted SKILL.md description for local skills;
          store-sourced ones fall back to the registry description. */}
      <p className="mt-3 line-clamp-2 min-h-[2.5em] text-[12px] leading-relaxed text-muted-foreground">
        {description || "暂无描述"}
      </p>

      {/* Bottom: scope selector (left) and remove action (right). */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <ScopeSelect
          scope={skill.scopeKey}
          projects={projects}
          busy={moving}
          onPick={onMove}
          onAddProject={onAddProject}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          title="移除"
          disabled={removing}
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function MySkillsPage() {
  const queryClient = useQueryClient();

  const { data: skills, isLoading, isError, error } = useInstalledSkills();
  const projects = useProjects();

  const list = useMemo(() => skills ?? [], [skills]);

  // Registry metadata (downloads / descriptions) for store-sourced skills,
  // resolved inside the registry worker. Best-effort: until the worker is
  // ready (or on failure) the map stays empty and the page degrades to
  // hiding downloads and disk-extracted descriptions only.
  const refs = useMemo<SkillRef[]>(
    () => list.map((skill) => ({ repo: skill.source ?? "", name: skill.name })),
    [list],
  );
  const meta = useRegistrySkillMeta(refs);

  // Enablement is a real backend state (the agents-skills library moves the
  // skill between the canonical and disabled dirs), reported by `skill.enabled`.
  // A small optimistic override keyed by row id is kept while a toggle is in
  // flight; once the list refetches, `skill.enabled` is the truth again.
  const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>(
    {},
  );
  // A single, dismissible banner for a failed move / remove / toggle, since the
  // three row actions share one surface and there is no toast layer yet.
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => markSkillsChanged(queryClient);

  const removeMutation = useMutation({
    mutationFn: (skill: ScopedInstalledSkill) =>
      removeInstalledSkill(skill.name, skill.scopeKey),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(errMessage(e, "移除失败")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      skill,
      enabled,
    }: {
      skill: ScopedInstalledSkill;
      enabled: boolean;
    }) => setSkillEnabled(skill.name, enabled, skill.scopeKey),
    onMutate: ({ skill, enabled }) =>
      setPendingEnabled((prev) => ({ ...prev, [rowId(skill)]: enabled })),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
      setPendingEnabled({});
    },
    onError: (e) => {
      setPendingEnabled({});
      setActionError(errMessage(e, "切换失败"));
      invalidate();
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({
      skill,
      to,
    }: {
      skill: ScopedInstalledSkill;
      to: SkillScope;
    }) => moveSkill(skill, to),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(errMessage(e, "迁移失败")),
  });

  // 1-based current page; the toolbar (search + scope filter + enablement
  // filter) is local state — the full installed list is already in memory, so
  // everything below filters and slices on the main thread.
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EnabledFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
    .trim()
    .toLowerCase();

  // Any toolbar control changes the result set, so they reset to page 1.
  const handleSearch = (q: string) => {
    setPage(1);
    setSearch(q);
  };
  const handleFilter = (next: EnabledFilter) => {
    setPage(1);
    setFilter(next);
  };
  const handleScopeFilter = (next: ScopeFilter) => {
    setPage(1);
    setScopeFilter(next);
  };

  // Deep link from the menu bar popover: `/my-skills?skill=<name>` pre-fills
  // the search box so the targeted skill is the only one in the list. The
  // param is consumed (removed) once applied so a refresh stays on the page.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const target = searchParams.get("skill");
    if (!target) return;
    setPage(1);
    setSearch(target);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(
    () =>
      list.filter((skill) => {
        if (scopeFilter !== "all" && skill.scopeKey.kind !== scopeFilter)
          return false;
        if (
          query &&
          !`${skill.name} ${skill.description ?? ""} ${skill.source ?? ""}`
            .toLowerCase()
            .includes(query)
        )
          return false;
        const enabled = pendingEnabled[rowId(skill)] ?? skill.enabled;
        if (filter === "enabled") return enabled;
        if (filter === "disabled") return !enabled;
        return true;
      }),
    [list, query, filter, scopeFilter, pendingEnabled],
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Project adding is shared with Settings: the native picker in the desktop
  // shell, a manual path dialog in the browser. The card's scope menu triggers it.
  const projectAdd = useProjectAdd();

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* Toolbar, styled like the store's full list: search first, controls
          clustered on the right. */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索 Skill..."
            aria-label="搜索 Skill"
            className="h-9 rounded-full pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <AgentAvatarMenu />

          <FilterDropdown
            label="范围"
            value={scopeFilter}
            options={SCOPE_OPTIONS}
            onChange={handleScopeFilter}
          />
          <FilterDropdown
            label="筛选"
            value={filter}
            options={ENABLE_OPTIONS}
            onChange={handleFilter}
          />
        </div>
      </div>

      {actionError && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            className="shrink-0 font-medium underline-offset-2 hover:underline"
            onClick={() => setActionError(null)}
          >
            知道了
          </button>
        </div>
      )}

      {/* Card grid with the pager row pinned to the bottom, mirroring the store
          page. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-4">
          {isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Users className="h-7 w-7 opacity-40" />
              <p className="text-[12px]">
                加载失败：{error instanceof Error ? error.message : "未知错误"}
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <p className="text-[13px]">还没有安装任何技能</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <p className="text-[13px]">
                {query
                  ? `未找到匹配“${query}”的 Skill`
                  : scopeFilter !== "all"
                    ? "当前范围内没有技能"
                    : "没有符合条件的 Skill"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {visible.map((skill) => {
                const id = rowId(skill);
                const indexEntry = meta.get(`${skill.source}/${skill.name}`);
                return (
                  <SkillCardItem
                    key={id}
                    skill={skill}
                    projects={projects}
                    enabled={pendingEnabled[id] ?? skill.enabled}
                    description={
                      skill.description ?? indexEntry?.description ?? ""
                    }
                    removing={
                      removeMutation.isPending &&
                      removeMutation.variables != null &&
                      rowId(removeMutation.variables) === id
                    }
                    moving={
                      moveMutation.isPending &&
                      rowId(moveMutation.variables?.skill) === id
                    }
                    onToggle={(enabled) =>
                      toggleMutation.mutate({ skill, enabled })
                    }
                    onRemove={() => removeMutation.mutate(skill)}
                    onMove={(to) => moveMutation.mutate({ skill, to })}
                    onAddProject={projectAdd.start}
                  />
                );
              })}
            </div>
          )}
        </div>

        {!isLoading && !isError && list.length > 0 && (
          <ListPager
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            count={`共 ${total} 个`}
          />
        )}
      </div>

      {/* Browser-only manual path entry, the fallback for the native picker. */}
      <AddProjectDialog
        open={projectAdd.manualOpen}
        onOpenChange={projectAdd.setManualOpen}
      />
    </div>
  );
}

/** A single-select toolbar filter rendered as a pill dropdown, shared by the
 *  enablement and scope filters. The trigger shows the active option (or the
 *  neutral `label` when it is the "all" default). */
function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="rounded-full px-4">
          {value === ("all" as T)
            ? label
            : options.find((option) => option.value === value)?.label}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Best-effort message from a rejected mutation (Tauri rejects with non-Error). */
function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}
