import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Boxes,
  Check,
  LayoutGrid,
  Puzzle,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { setSkillEnabled } from "../../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../../hooks/use-installed-skills";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import type { InstalledSkill } from "../../lib/skills-manager";
import type { Skill } from "../../types/skill";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { FilterDropdown, type FilterOption } from "../../components/filter-dropdown";
import { Placeholder } from "../../components/placeholder";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { ListPager } from "../../components/list-pager";
import { Switch } from "../../components/ui/switch";
import { cn, errorMessage } from "../../lib/utils";
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../../lib/pagination";
import { buildSearchIndex } from "../../lib/search-index";
import { SKILL_LIST_CLASS } from "../../lib/skill-list-layout";
import { useClampedPage } from "../../hooks/use-clamped-page";
import { SearchInput } from "../../components/search-input";

/** Enablement filter offered by the toolbar dropdown. */
type EnabledFilter = "all" | "enabled" | "disabled";

const ENABLE_OPTIONS: FilterOption<EnabledFilter>[] = [
  { value: "all", label: "全部", icon: LayoutGrid, neutral: true },
  { value: "enabled", label: "已启用", icon: Check },
  { value: "disabled", label: "已禁用", icon: Ban },
];

/** Stable identity for a row: a skill's name is unique in the global directory. */
function rowId(skill: InstalledSkill): string {
  return skill.name;
}

/**
 * The `Skill` shape the shared detail panel consumes, synthesized from the
 * installed record. `path` stays undefined, which makes the panel read the
 * SKILL.md from the local skills directory — the version the user actually
 * has — and the empty repo hides stats and upstream links the record cannot
 * vouch for (agents-skills 0.13 no longer reports an install source).
 */
function detailSkillFor(skill: InstalledSkill): Skill {
  return {
    name: skill.name,
    repo: "",
    description: skill.description ?? "",
    stars: 0,
    downloads: 0,
  };
}

/**
 * One installed skill, in the same card shape and the same slots the store list
 * uses: avatar, name and source in the header, the enable switch in the corner
 * the store card puts its install action in, description in the content.
 *
 * Uninstalling is deliberately absent: it lives in the detail panel, so a card
 * (whose whole body is a click target) never carries an irreversible action.
 */
function InstalledSkillRow({
  skill,
  enabled,
  selected,
  description,
  onToggle,
  onOpen,
}: {
  skill: InstalledSkill;
  enabled: boolean;
  /** Whether this card is the one shown in the detail panel. */
  selected: boolean;
  description: string;
  onToggle: (enabled: boolean) => void;
  /** Opens the shared skill detail panel. */
  onOpen: () => void;
}) {
  return (
    <li className="flex flex-col">
      <Card
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
          "flex-1 cursor-pointer transition-all duration-150",
          "hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)]",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          !enabled && "opacity-60",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {/* No install source since agents-skills 0.13, so every card
                carries the same Puzzle placeholder avatar. */}
            <div
              aria-label="skill 头像"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted text-muted-foreground"
            >
              <Puzzle className="h-3.5 w-3.5" />
            </div>
            <h3
              className={cn(
                "truncate",
                enabled ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {skill.name}
            </h3>
          </CardTitle>
          <CardDescription
            className={cn(
              "truncate",
              !enabled && "text-muted-foreground/70",
            )}
          >
            本地安装
          </CardDescription>
          {/* The card's own control, in the same corner the store card puts its
              install action. Clicks stay here: the card body opens the detail
              panel, this must not. */}
          <CardAction onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              aria-label={`${enabled ? "关闭" : "开启"} ${skill.name}`}
            />
          </CardAction>
        </CardHeader>

        {/* The description extracted from the on-disk SKILL.md frontmatter. */}
        <CardContent className="line-clamp-2 text-sm text-muted-foreground">
          {description || "暂无描述"}
        </CardContent>
      </Card>
    </li>
  );
}

export function MySkillsPage() {
  const queryClient = useQueryClient();

  const { data: skills, isLoading, isError, error } = useInstalledSkills();

  const list = useMemo(() => skills ?? [], [skills]);

  // Enablement is a real backend state (the agents-skills library moves the
  // skill between the canonical and disabled dirs), reported by `skill.enabled`.
  // A small optimistic override keyed by row id is kept while a toggle is in
  // flight; once the list refetches, `skill.enabled` is the truth again.
  const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>(
    {},
  );

  const invalidate = () => markSkillsChanged(queryClient);

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
      await invalidate();
      setPendingEnabled({});
    },
    onError: (e) => {
      setPendingEnabled({});
      toast.error(errorMessage(e, "切换失败"));
      // Best-effort refresh: the error is already shown, so keep the promise
      // from turning into an unhandled rejection.
      void invalidate();
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
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

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
  // the search box, which ranks the targeted skill near the top (its name is
  // the whole query, and the name field is boosted) along with any sibling
  // whose terms it shares. The param is consumed (removed) once applied so a
  // refresh stays on the page.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const target = searchParams.get("skill");
    if (!target) return;
    setPage(1);
    setSearch(target);
    setSelected(null);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // The store's single search entry point, over the installed list: a term or
  // the start of one matches, a mistyped word does not. Installed lists are
  // short, so the index is cheap to build here and rebuild when the list
  // changes — unlike the registry, which builds the same index in the worker.
  // The field boosts mirror the registry's priority: what a skill is called
  // beats a description that repeats a trigger phrase.
  const searchInstalled = useMemo(
    () =>
      buildSearchIndex(list, {
        fields: { name: 4, description: 0.5 },
      }),
    [list],
  );

  // A query orders its own results by relevance; the enablement filter then
  // narrows that list without reordering it.
  const filtered = useMemo(() => {
    const matched = query
      ? searchInstalled(query).map(({ doc }) => doc)
      : list;
    return matched.filter((skill) => {
      const enabled = pendingEnabled[rowId(skill)] ?? skill.enabled;
      if (filter === "enabled") return enabled;
      if (filter === "disabled") return !enabled;
      return true;
    });
  }, [list, searchInstalled, query, filter, pendingEnabled]);

  const total = filtered.length;
  const totalPages = useClampedPage(page, total, PAGE_SIZE, setPage);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageOffset = (page - 1) * PAGE_SIZE;

  // The drawer walks the whole filtered result set, not just the current
  // page, so ←/→ keeps going across page boundaries.
  const detailSkills = useMemo(
    () => filtered.map((skill) => detailSkillFor(skill)),
    [filtered],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-0">
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

      {/* The skill list, in the store's row shape, with the pager row pinned to
          the bottom. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-0">
          {isError ? (
            <Placeholder
              icon={Users}
              message={`加载失败：${errorMessage(error)}`}
            />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <Placeholder icon={Boxes} message="还没有安装任何技能" />
          ) : visible.length === 0 ? (
            <Placeholder
              message={
                query ? `未找到匹配“${query}”的 Skill` : "没有符合条件的 Skill"
              }
            />
          ) : (
            <ul className={SKILL_LIST_CLASS}>
              {visible.map((skill, i) => {
                const id = rowId(skill);
                const index = pageOffset + i;
                return (
                  <InstalledSkillRow
                    key={id}
                    skill={skill}
                    enabled={pendingEnabled[id] ?? skill.enabled}
                    selected={selected === index}
                    description={skill.description ?? ""}
                    onToggle={(enabled) =>
                      toggleMutation.mutate({ skill, enabled })
                    }
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
          whole filtered result set, across page boundaries. Uninstalling from
          it closes it: this list shrinks with the skill, so the same index
          would land on a different one — a swap the reader never asked for. */}
      <SkillDetailDrawer
        skills={detailSkills}
        selected={selected}
        onSelect={setSelected}
        onRemoved={() => setSelected(null)}
      />
    </div>
  );
}
