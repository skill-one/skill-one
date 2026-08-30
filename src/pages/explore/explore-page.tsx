import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  SearchX,
} from "lucide-react";

import {
  fetchFullIndex,
  SKILLS_QUERY_KEY,
} from "../../lib/skills-api";
import {
  createSkillSearch,
  type SkillSearchHit,
} from "../../lib/search-skills";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "../../components/ui/pagination";
import { Separator } from "../../components/ui/separator";
import { SkillCard } from "./skill-card";
import { SkillDetailPanel } from "./skill-detail-panel";

/** Number of skills shown per page in the paginated registry view. */
const PAGE_SIZE = 24;

/**
 * Sort orders offered by the toolbar dropdown. "default" keeps the registry
 * index order; the other orders sort the filtered list client-side.
 */
type SortOrder = "default" | "downloads" | "name";

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "default", label: "默认排序" },
  { value: "downloads", label: "按下载量" },
  { value: "name", label: "按名称" },
];

/**
 * Collapse the pagination bar once there are too many pages to list: keep the
 * first and last pages plus a window of pages around the current one, inserting
 * "…" for each gap, so a wide range stays reachable without rendering hundreds
 * of buttons. When there are few pages (≤ SHOW_ALL_THRESHOLD) every page number
 * is shown directly.
 */
const SHOW_ALL_THRESHOLD = 9;
const PAGE_WINDOW = 2;

function pageRange(current: number, total: number): Array<number | "..."> {
  if (total <= SHOW_ALL_THRESHOLD) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total]);
  for (let i = current - PAGE_WINDOW; i <= current + PAGE_WINDOW; i++) {
    pages.add(i);
  }
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: Array<number | "..."> = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("...");
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Centered "nothing to show" state with an optional retry action, shared by
 * the explore and featured pages (search misses, load failures, empty lists).
 */
export function Placeholder({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 pb-[12vh] text-muted-foreground">
      <SearchX className="h-8 w-8 opacity-40" />
      <p className="text-[13px]">{message}</p>
      {children}
    </div>
  );
}

export function ExplorePage() {
  // 1-based current page.
  const [page, setPage] = useState(1);

  // Search text and sort order; any change invalidates the page/selection
  // because the result list (and the meaning of a card index) changes.
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOrder>("default");

  const {
    data: index,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [...SKILLS_QUERY_KEY],
    queryFn: fetchFullIndex,
  });

  // Reusable fuzzy-search index over the registry (weighted name > repo >
  // description, with a popularity boost from star counts). The built search
  // is cached per data reference inside search-skills, so remounting this
  // page never rebuilds the index — only a fresh fetch does.
  const skillSearch = useMemo(() => createSkillSearch(index ?? []), [index]);

  // Search filter: fuzzy match over name, repo and description, applied on
  // every keystroke — the index is ~24k entries. Keeping the search text out
  // of the query key also avoids persisting a localStorage cache entry per
  // search term. An empty query bypasses the search and keeps the full
  // registry in its original order, with nothing highlighted.
  const filtered = useMemo((): SkillSearchHit[] => {
    const q = search.trim();
    if (!q) return (index ?? []).map((skill) => ({ skill, matched: {} }));
    return skillSearch(q);
  }, [skillSearch, search]);

  // "default" keeps the (filtered) relevance order; the others sort a copy.
  const sorted = useMemo(() => {
    if (sort === "default") return filtered;
    const out = [...filtered];
    if (sort === "downloads") {
      out.sort((a, b) => b.skill.downloads - a.skill.downloads);
    } else {
      out.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
    }
    return out;
  }, [filtered, sort]);

  // Client-side pagination over the filtered+sorted list. `total` is the
  // registry-wide count (null until the index has loaded); the toolbar count
  // reports the filtered total instead.
  const total = index?.length ?? null;
  const filteredTotal = sorted.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const skills = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  // A background refetch can shrink the index below the current page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Index into `skills` of the skill shown in the detail panel; null keeps
  // the panel closed (full-width grid). Clicking a card while the panel is
  // open simply swaps the selection, so switching skills never replays the
  // slide-in animation.
  const [selected, setSelected] = useState<number | null>(null);
  const selectedSkill =
    selected != null ? (skills[selected]?.skill ?? null) : null;

  const handleSearch = (q: string) => {
    setSelected(null);
    setPage(1);
    setSearch(q);
  };
  const handleSort = (order: SortOrder) => {
    setSelected(null);
    setPage(1);
    setSort(order);
  };

  const gridRef = useRef<HTMLDivElement>(null);

  // Go to a numbered page and close any open detail panel.
  const handlePage = (p: number) => {
    setSelected(null);
    setPage(p);
  };

  // Direct page jump: parse the typed number, clamp to [1, totalPages].
  const [jump, setJump] = useState("");
  const submitJump = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Math.floor(Number(jump));
    if (!Number.isFinite(n)) return;
    handlePage(Math.min(totalPages, Math.max(1, n)));
    setJump("");
  };

  // Anchor-based pagination controls have no `disabled` attribute, so guard
  // against navigating past the first/last page here.
  const goPrev = () => {
    if (page > 1) handlePage(page - 1);
  };
  const goNext = () => {
    if (page < totalPages) handlePage(page + 1);
  };

  const handlePrev = () => {
    if (selected != null) setSelected(Math.max(0, selected - 1));
  };

  const handleNext = () => {
    if (selected == null || selected + 1 >= skills.length) return;
    setSelected(selected + 1);
  };

  // Scroll the selected card into view only when the detail panel opens
  // (null → index): collapsing the grid from 3 columns to 1 shifts every
  // card's position, so the clicked card would otherwise land off-screen.
  // Switching skills while the panel is already open keeps the layout
  // stable, so no scroll adjustment happens then.
  const prevSelectedRef = useRef<number | null>(null);
  useEffect(() => {
    const wasClosed = prevSelectedRef.current == null;
    prevSelectedRef.current = selected;
    if (selected == null || !wasClosed) return;
    const card = gridRef.current?.children[selected] as HTMLElement | undefined;
    card?.scrollIntoView({ block: "start" });
  }, [selected, skills]);

  const range = pageRange(page, totalPages);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* Toolbar: search on the left; category, sort and the filtered skill
          count on the right. */}
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
          {/* Placeholder: the registry index carries no category field, so
              "全部" is the only selectable entry until the data source grows
              real categories. The radio group without onValueChange keeps the
              item permanently selected. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full px-4">
                分类
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value="all">
                <DropdownMenuRadioItem value="all">
                  全部
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                更多分类 · 即将上线
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full px-4">
                {SORT_OPTIONS.find((option) => option.value === sort)?.label}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => handleSort(value as SortOrder)}
              >
                {SORT_OPTIONS.map((option) => (
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

          {total != null && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                共 {filteredTotal} 个
              </span>
            </>
          )}
        </div>
      </div>

      {/* Split layout: skill grid on the left, fixed detail panel on the
          right while a skill is selected. */}
      <div className="flex min-h-0 flex-1 flex-row">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
            {isError ? (
              <Placeholder
                message={`加载失败：${error instanceof Error ? error.message : "未知错误"}`}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void refetch()}
                >
                  重试
                </Button>
              </Placeholder>
            ) : isLoading ? (
              <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : skills.length === 0 ? (
              <Placeholder
                message={
                  search.trim()
                    ? `未找到匹配“${search.trim()}”的 Skill`
                    : "暂无技能"
                }
              />
            ) : (
              <div
                ref={gridRef}
                className={cn(
                  "grid gap-4",
                  // The detail panel takes ~440px, so the grid collapses
                  // to a single column while it is open.
                  selectedSkill
                    ? "grid-cols-1"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                )}
              >
                {skills.map((hit, i) => (
                  <SkillCard
                    key={`${hit.skill.repo}/${hit.skill.name}`}
                    skill={hit.skill}
                    matched={hit.matched}
                    selected={i === selected}
                    onSelect={() => setSelected(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination bar: previous / numbered pages (with ellipsis) /
              next, plus an inline "jump to page" input — shown once a page
              of data is available. */}
          {index && totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 border-t border-border py-2">
              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationLink
                      size="icon"
                      href="#"
                      aria-label="上一页"
                      aria-disabled={page <= 1}
                      className={cn(
                        "h-8 w-8",
                        page <= 1 && "pointer-events-none opacity-50",
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        goPrev();
                      }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                  {range.map((p, i) =>
                    p === "..." ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis className="h-8 w-8" />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          size="icon"
                          href="#"
                          className="h-8 w-8"
                          isActive={p === page}
                          onClick={(e) => {
                            e.preventDefault();
                            handlePage(p);
                          }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationLink
                      size="icon"
                      href="#"
                      aria-label="下一页"
                      aria-disabled={page >= totalPages}
                      className={cn(
                        "h-8 w-8",
                        page >= totalPages &&
                          "pointer-events-none opacity-50",
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        goNext();
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </PaginationLink>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <form
                onSubmit={submitJump}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
              >
                <span>第</span>
                <Input
                  value={jump}
                  onChange={(e) => setJump(e.target.value)}
                  inputMode="numeric"
                  aria-label="跳转到第几页"
                  className="h-8 w-14 px-2 text-center text-[12px]"
                />
                <span>/ {totalPages} 页</span>
              </form>
            </div>
          )}
        </div>

        <SkillDetailPanel
          skill={selectedSkill}
          onPrev={handlePrev}
          onNext={handleNext}
          onClose={() => setSelected(null)}
        />
      </div>
    </div>
  );
}
