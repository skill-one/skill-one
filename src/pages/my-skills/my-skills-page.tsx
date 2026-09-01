import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import { removeInstalledSkill, setSkillEnabled } from "../../lib/local-skills";
import type { InstalledSkill } from "../../lib/skills-manager";
import type { SkillRef } from "../../lib/registry/protocol";
import { cn } from "../../lib/utils";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../../hooks/use-installed-skills";
import { useRegistrySkillMeta } from "../../hooks/use-registry-skill-meta";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { AgentAvatarMenu } from "./agent-avatar-menu";
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

/** Skills shown per page; same rhythm as the store's full list. */
const PAGE_SIZE = 24;

/** Keystrokes settle this long before the local list is filtered. */
const SEARCH_DEBOUNCE_MS = 150;

/** Enablement filter offered by the toolbar dropdown. */
type EnabledFilter = "all" | "enabled" | "disabled";

const FILTER_OPTIONS: Array<{ value: EnabledFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "已启用" },
  { value: "disabled", label: "已禁用" },
];

function sourceLabelFor(skill: InstalledSkill): string {
  // No source record (e.g. placed manually into the global directory) or an
  // explicit local source both mean this is a local skill.
  if (!skill.sourceType || skill.sourceType === "local") return "本地";
  return skill.source || skill.sourceType || "本地";
}

function SkillCardItem({
  skill,
  enabled,
  onToggle,
  onRemove,
  removing,
  description,
}: {
  skill: InstalledSkill;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  removing: boolean;
  description: string;
}) {
  return (
    <div
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

      {/* Bottom: right-aligned actions (remove). */}
      <div className="mt-3 flex items-center justify-end">
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="移除"
            disabled={removing}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MySkillsPage() {
  const queryClient = useQueryClient();

  const { data: skills, isLoading, isError, error } = useInstalledSkills();

  const list = skills ?? [];

  // Registry metadata (downloads / descriptions) for store-sourced skills,
  // resolved inside the registry worker. Best-effort: until the worker is
  // ready (or on failure) the map stays empty and the page degrades to
  // hiding downloads and disk-extracted descriptions only — the same
  // all-or-nothing contract the full download used to provide.
  const refs = useMemo<SkillRef[]>(
    () => list.map((skill) => ({ repo: skill.source ?? "", name: skill.name })),
    [list],
  );
  const meta = useRegistrySkillMeta(refs);

  // Enablement is a real backend state (the agents-skills library moves the
  // skill between the canonical and disabled dirs), reported by `skill.enabled`.
  // We keep a small optimistic override while a toggle mutation is in flight;
  // once the list refetches after the mutation, `skill.enabled` is the truth.
  const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>(
    {},
  );

  const invalidate = () => markSkillsChanged(queryClient);

  const removeMutation = useMutation({
    mutationFn: (name: string) => removeInstalledSkill(name),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      setSkillEnabled(name, enabled),
    onMutate: ({ name, enabled }) =>
      setPendingEnabled((prev) => ({ ...prev, [name]: enabled })),
    onSuccess: async () => {
      await markSkillsChanged(queryClient);
      setPendingEnabled({});
    },
    onError: () => {
      setPendingEnabled({});
      invalidate();
    },
  });

  // 1-based current page; the toolbar (search + enablement filter) is local
  // state — the full installed list is already in memory, so everything below
  // filters and slices on the main thread, mirroring the store's layout.
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EnabledFilter>("all");
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
    .trim()
    .toLowerCase();

  // Both toolbar controls change the result set, so they reset to page 1.
  const handleSearch = (q: string) => {
    setPage(1);
    setSearch(q);
  };
  const handleFilter = (next: EnabledFilter) => {
    setPage(1);
    setFilter(next);
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
        if (
          query &&
          !`${skill.name} ${skill.description ?? ""} ${skill.source ?? ""}`
            .toLowerCase()
            .includes(query)
        )
          return false;
        const enabled = pendingEnabled[skill.name] ?? skill.enabled;
        if (filter === "enabled") return enabled;
        if (filter === "disabled") return !enabled;
        return true;
      }),
    [list, query, filter, pendingEnabled],
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Removing (or filtering away) skills can shrink the list below the current
  // page; clamp back so the grid never shows an empty tail page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* Toolbar, styled exactly like the store's full list: search first,
          controls clustered on the right. The agent link strip (its actions in
          the avatar group's dropdown menu) sits beside the filter button. */}
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full px-4">
                {filter === "all"
                  ? "筛选"
                  : FILTER_OPTIONS.find((option) => option.value === filter)
                      ?.label}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={filter}
                onValueChange={(value) =>
                  handleFilter(value as EnabledFilter)
                }
              >
                {FILTER_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Card grid with the pager row pinned to the bottom, mirroring the
          store page: the scroll container carries the same overlay-scrollbar
          clearance (negative margin + padding pair) as the full list. */}
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
                {query ? `未找到匹配“${query}”的 Skill` : "没有符合条件的 Skill"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {visible.map((skill) => {
                const indexEntry = meta.get(`${skill.source}/${skill.name}`);
                return (
                  <SkillCardItem
                    key={skill.name}
                    skill={skill}
                    enabled={pendingEnabled[skill.name] ?? skill.enabled}
                    onToggle={(enabled) =>
                      toggleMutation.mutate({ name: skill.name, enabled })
                    }
                    onRemove={() => removeMutation.mutate(skill.name)}
                    removing={
                      removeMutation.isPending &&
                      removeMutation.variables === skill.name
                    }
                    description={
                      skill.description ?? indexEntry?.description ?? ""
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Skill count plus page controls, pinned to the bottom like the
            store page's pager row. */}
        {!isLoading && !isError && list.length > 0 && (
          <ListPager
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            count={`共 ${total} 个`}
          />
        )}
      </div>
    </div>
  );
}
