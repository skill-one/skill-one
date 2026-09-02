import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  Puzzle,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";

import { removeInstalledSkill, setSkillEnabled } from "../../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../../hooks/use-installed-skills";
import { useRegistrySkillMeta } from "../../hooks/use-registry-skill-meta";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import type { SkillRef } from "../../lib/registry/protocol";
import type { InstalledSkill } from "../../lib/skills-manager";
import type { Skill } from "../../types/skill";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
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
import { ListPager } from "../../components/list-pager";
import { Switch } from "../../components/ui/switch";
import { cn, errorMessage } from "../../lib/utils";
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../../lib/pagination";
import { useClampedPage } from "../../hooks/use-clamped-page";
import { SearchInput } from "../../components/search-input";

/** Enablement filter offered by the toolbar dropdown. */
type EnabledFilter = "all" | "enabled" | "disabled";

const ENABLE_OPTIONS: Array<{ value: EnabledFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "已启用" },
  { value: "disabled", label: "已禁用" },
];

/** Stable identity for a row: a skill's name is unique in the global directory. */
function rowId(skill: InstalledSkill): string {
  return skill.name;
}

function sourceLabelFor(skill: InstalledSkill): string {
  // No source record (e.g. placed manually into the global directory) or an
  // explicit local source both mean this is a local skill.
  if (!skill.sourceType || skill.sourceType === "local") return "本地";
  return skill.source || skill.sourceType || "本地";
}

/**
 * The `Skill` shape the shared detail panel consumes. With a registry entry
 * the skill keeps its repo path, so the panel fetches SKILL.md from GitHub;
 * without one it is synthesized from the installed record — `path` stays
 * undefined, which makes the panel read the SKILL.md from the local skills
 * directory instead (the source repo, when known, is still only used for
 * display and links).
 */
function detailSkillFor(skill: InstalledSkill, meta: Map<string, Skill>): Skill {
  const entry = skill.source
    ? meta.get(`${skill.source}/${skill.name}`)
    : undefined;
  return (
    entry ?? {
      name: skill.name,
      repo: skill.source ?? "",
      description: skill.description ?? "",
      stars: 0,
      downloads: 0,
    }
  );
}

/**
 * One installed skill, in the same row shape the store list uses: avatar, name
 * and source, description, then the row's own actions on the right.
 */
function InstalledSkillRow({
  skill,
  enabled,
  removing,
  selected,
  description,
  onToggle,
  onRemove,
  onOpen,
}: {
  skill: InstalledSkill;
  enabled: boolean;
  removing: boolean;
  /** Whether this row is the one shown in the detail panel. */
  selected: boolean;
  description: string;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  /** Opens the shared skill detail panel. */
  onOpen: () => void;
}) {
  return (
    <li>
      <div
        data-skill={skill.name}
        role="button"
        tabIndex={0}
        aria-label={`查看 ${skill.name} 详情`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-card px-3.5 py-3 transition-all duration-150",
          "hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)]",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          !enabled && "opacity-60",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
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

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
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
                "truncate text-[12px]",
                enabled ? "text-muted-foreground" : "text-muted-foreground/70",
              )}
            >
              {sourceLabelFor(skill)}
            </p>
          </div>
          {/* Description: the disk-extracted SKILL.md description for local
              skills; store-sourced ones fall back to the registry description.
              One line, hidden on narrow windows, so the row keeps its height. */}
          <p className="mt-0.5 hidden truncate text-[13px] leading-relaxed text-muted-foreground lg:block">
            {description || "暂无描述"}
          </p>
        </div>

        {/* The row's own actions. Clicks stay here: the row body opens the
            detail panel, these controls must not. */}
        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label={`${enabled ? "关闭" : "开启"} ${skill.name}`}
          />
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
    </li>
  );
}

export function MySkillsPage() {
  const queryClient = useQueryClient();

  const { data: skills, isLoading, isError, error } = useInstalledSkills();

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
  // A single, dismissible banner for a failed remove / toggle, since the two
  // row actions share one surface and there is no toast layer yet.
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => markSkillsChanged(queryClient);

  const removeMutation = useMutation({
    mutationFn: (skill: InstalledSkill) => removeInstalledSkill(skill.name),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(errorMessage(e, "移除失败")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({
      skill,
      enabled,
    }: {
      skill: InstalledSkill;
      enabled: boolean;
    }) => setSkillEnabled(skill.name, enabled),
    onMutate: ({ skill, enabled }) =>
      setPendingEnabled((prev) => ({ ...prev, [rowId(skill)]: enabled })),
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
      setPendingEnabled({});
    },
    onError: (e) => {
      setPendingEnabled({});
      setActionError(errorMessage(e, "切换失败"));
      invalidate();
    },
  });

  // 1-based current page; the toolbar (search + enablement filter) is local
  // state — the full installed list is already in memory, so everything below
  // filters and slices on the main thread.
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EnabledFilter>("all");
  // Open skill in the shared detail drawer: an index into `filtered` (the
  // whole result set, across pages), null keeps the drawer closed. Toolbar
  // changes rebuild `filtered`, so they close the drawer to avoid walking a
  // shifted or vanished selection.
  const [selected, setSelected] = useState<number | null>(null);
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
    .trim()
    .toLowerCase();

  // Any toolbar control changes the result set, so they reset to page 1.
  const handleSearch = (q: string) => {
    setPage(1);
    setSearch(q);
    setSelected(null);
  };
  const handleFilter = (next: EnabledFilter) => {
    setPage(1);
    setFilter(next);
    setSelected(null);
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
    setSelected(null);
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
        const enabled = pendingEnabled[rowId(skill)] ?? skill.enabled;
        if (filter === "enabled") return enabled;
        if (filter === "disabled") return !enabled;
        return true;
      }),
    [list, query, filter, pendingEnabled],
  );

  const total = filtered.length;
  const totalPages = useClampedPage(page, total, PAGE_SIZE, setPage);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageOffset = (page - 1) * PAGE_SIZE;

  // The drawer walks the whole filtered result set, not just the current
  // page, so ←/→ keeps going across page boundaries.
  const detailSkills = useMemo(
    () => filtered.map((skill) => detailSkillFor(skill, meta)),
    [filtered, meta],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 pt-5 pb-0">
      {/* Toolbar, styled like the store's full list: search first, controls
          clustered on the right. */}
      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={handleSearch} label="搜索 Skill" />

        <div className="ml-auto flex items-center gap-2">
          <AgentAvatarMenu />

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

      {/* The skill list, in the store's row shape, with the pager row pinned to
          the bottom. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-0">
          {isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Users className="h-7 w-7 opacity-40" />
              <p className="text-[12px]">
                加载失败：{errorMessage(error)}
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
                  : "没有符合条件的 Skill"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((skill, i) => {
                const id = rowId(skill);
                const index = pageOffset + i;
                const indexEntry = meta.get(`${skill.source}/${skill.name}`);
                return (
                  <InstalledSkillRow
                    key={id}
                    skill={skill}
                    enabled={pendingEnabled[id] ?? skill.enabled}
                    selected={selected === index}
                    description={
                      skill.description ?? indexEntry?.description ?? ""
                    }
                    removing={
                      removeMutation.isPending &&
                      removeMutation.variables != null &&
                      rowId(removeMutation.variables) === id
                    }
                    onToggle={(enabled) =>
                      toggleMutation.mutate({ skill, enabled })
                    }
                    onRemove={() => removeMutation.mutate(skill)}
                    onOpen={() => setSelected(index)}
                  />
                );
              })}
            </ul>
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

      {/* Same right-side detail drawer the store pages use; ←/→ walks the
          whole filtered result set, across page boundaries. */}
      <SkillDetailDrawer
        skills={detailSkills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}

/** A single-select toolbar filter rendered as a pill dropdown for the
 *  enablement filter. The trigger shows the active option (or the neutral
 *  `label` when it is the "all" default). */
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
