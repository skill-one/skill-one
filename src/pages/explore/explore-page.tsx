import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search, SearchX } from "lucide-react";

import { useRegistryPage } from "../../hooks/use-registry-page";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import type { SearchHit, SortOrder } from "../../lib/registry/protocol";
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
import { Skeleton } from "../../components/ui/skeleton";
import { SkillCard } from "./skill-card";
import { SkillDetailDrawer } from "./skill-detail-drawer";
import { ListPager } from "../../components/list-pager";

/** Number of skills shown per page in the paginated registry view. */
const PAGE_SIZE = 24;

/** Keystrokes settle this long before a search query reaches the worker. */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * The sort orders offered by the toolbar dropdown. "default" keeps the
 * registry index order; the other orders are applied inside the worker.
 */
const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "default", label: "默认排序" },
  { value: "downloads", label: "按下载量" },
  { value: "name", label: "按名称" },
];

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

/**
 * Loading placeholder mirroring the skill grid: a viewport's worth of
 * card-shaped skeletons, so switching to this page paints its final layout
 * instantly and real cards replace the placeholders as the index streams in
 * (instead of an empty spin that reads as "the page never switched").
 */
function ExploreSkeleton() {
  return (
    <div
      className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden
    >
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} className="h-[136px] rounded-xl" />
      ))}
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
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

  // Worker progress: the climbing count, the streaming/indexing flags and
  // the retry action for a failed download.
  const stats = useRegistryStats();

  // One page-sized answer from the registry worker; all filtering, sorting
  // and slicing happen there — the main thread never touches the registry.
  const {
    data: pageData,
    isLoading,
    isError,
    error,
    refetch: refetchPage,
  } = useRegistryPage(query, sort, page - 1, PAGE_SIZE);

  const hits: SearchHit[] = pageData?.hits ?? [];

  // A download failure only owns the screen while there is nothing to show;
  // with data on screen (cache / previous source) the error surfaces in the
  // footer count instead of blanking the page.
  const failure =
    stats.count === 0 && !stats.complete
      ? (stats.error ??
        (isError && error instanceof Error ? error.message : null))
      : null;

  // The skeleton stays up until the very first skill arrives; after that the
  // grid paints from partial data and grows with the stream.
  const loading =
    isLoading || (hits.length === 0 && stats.count === 0 && !failure);

  // Total of the (filtered) list, reported by the worker; before the first
  // answer lands the progressive count stands in.
  const total = pageData?.total ?? stats.count;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A background refetch can shrink the index below the current page; while
  // the index is still streaming in, pages beyond the loaded prefix are also
  // clamped away until more data arrives.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Index into `hits` of the skill shown in the detail panel; null keeps the
  // panel closed (full-width grid). Clicking a card while the panel is open
  // simply swaps the selection, so switching skills never replays the
  // slide-in animation.
  const [selected, setSelected] = useState<number | null>(null);
  // The sheet indexes a plain Skill list (the paged search hits, unwrapped).
  const pageSkills = useMemo(() => hits.map((hit) => hit.skill), [hits]);

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

  // Go to a numbered page and close any open detail panel.
  const handlePage = (p: number) => {
    setSelected(null);
    setPage(p);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* Toolbar: search on the left; category and sort on the right. */}
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
                <DropdownMenuRadioItem value="all">全部</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>更多分类 · 即将上线</DropdownMenuItem>
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
        </div>
      </div>

      {/* Skill grid; the modal detail drawer overlays it without reflowing
          it or moving its scroll position. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Grid. The horizontal padding is sized for the macOS-style
              overlay scrollbar: a hovered (transformed) card is painted
              over the thumb, so the cards need reserved space on the right
              instead of sitting under it. Each padding is offset by a
              matching negative margin, so content position and card widths
              are unchanged while the outside-painted ink — the selected
              ring and the focus outline — stays unclipped; the 4px top
              pair does the same at the flush top edge. */}
          <div className="min-h-0 flex-1 -mx-3 -mt-1 overflow-y-auto px-3 pb-6 pt-1">
            {failure ? (
              <Placeholder message={`加载失败：${failure}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    stats.refetch();
                    void refetchPage();
                  }}
                >
                  重试
                </Button>
              </Placeholder>
            ) : loading ? (
              <ExploreSkeleton />
            ) : hits.length === 0 ? (
              <Placeholder
                message={query ? `未找到匹配“${query}”的 Skill` : "暂无技能"}
              />
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {hits.map((hit, i) => (
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

          {/* Pagination row: previous / numbered pages (with ellipsis) / next
              — the current page number doubles as an editable jump box — with
              the skill count pinned to the right (shared with the repos
              page). While the index is streaming in the count climbs, so say
              so. */}
          {(stats.count > 0 || stats.complete) && (
            <ListPager
              page={page}
              totalPages={totalPages}
              onPage={handlePage}
              count={`共 ${total} 个${stats.complete ? "" : " · 加载中"}${
                stats.indexing ? " · 索引中" : ""
              }`}
            />
          )}
        </div>
      </div>

      {/* Modal detail drawer; the wiring (open/close, prev/next bounds) is
          shared with the featured page. */}
      <SkillDetailDrawer
        skills={pageSkills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
