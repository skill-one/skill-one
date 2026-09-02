import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { useRegistryPage } from "../../hooks/use-registry-page";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useClampedPage } from "../../hooks/use-clamped-page";
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../../lib/pagination";
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
import { SkeletonList } from "../../components/skeleton-list";
import { SkillListRow } from "./skill-list-row";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { ListPager } from "../../components/list-pager";
import { Placeholder } from "../../components/placeholder";
import { SearchInput } from "../../components/search-input";

/**
 * The sort orders offered by the toolbar dropdown; both are applied inside the
 * worker and order the *browsed* list. Downloads is the entry order — "most
 * installed first" is the reading a store visitor wants, and the registry index
 * order was never a choice worth exposing.
 *
 * A search is the exception: the worker answers it in relevance order, so the
 * dropdown is replaced by a read-only 相关度 pill rather than claiming an order
 * the results do not follow.
 */
const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "downloads", label: "按下载量" },
  { value: "name", label: "按名称" },
];

/**
 * Container of the skill list — one row per skill, leaderboard style.
 * Extracted because both the results and the loading placeholder agree on it.
 */
const LIST_CLASS = "flex flex-col gap-2";

/**
 * Loading placeholder mirroring the skill list: a viewport's worth of
 * row-shaped skeletons, so switching to this page paints its final layout
 * instantly and real rows replace the placeholders as the index streams in
 * (instead of an empty spin that reads as "the page never switched").
 */
function ExploreSkeleton() {
  return (
    <SkeletonList
      rows={12}
      listClassName={LIST_CLASS}
      itemClassName="h-16 rounded-xl"
    />
  );
}

export function ExplorePage() {
  // 1-based current page.
  const [page, setPage] = useState(1);

  // Search text and sort order; any change invalidates the page/selection
  // because the result list (and the meaning of a row index) changes.
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOrder>("downloads");
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
  // list paints from partial data and grows with the stream.
  const loading =
    isLoading || (hits.length === 0 && stats.count === 0 && !failure);

  // Total of the (filtered) list, reported by the worker; before the first
  // answer lands the progressive count stands in. Beyond a shrinking index the
  // page is clamped, and while the registry streams in that also hides pages
  // past the loaded prefix until more data arrives.
  const total = pageData?.total ?? stats.count;
  const totalPages = useClampedPage(page, total, PAGE_SIZE, setPage);

  // Index into `hits` of the skill shown in the detail panel; null keeps the
  // panel closed. Clicking a row while the panel is open
  // simply swaps the selection, so switching skills never replays the
  // slide-in animation.
  const [selected, setSelected] = useState<number | null>(null);
  // The sheet indexes a plain Skill list (the paged search hits, unwrapped).
  // Depends on the query result, not the derived array: `hits` is a fresh
  // identity whenever the page re-renders, which would recompute this every time.
  const pageSkills = useMemo(
    () => (pageData?.hits ?? []).map((hit) => hit.skill),
    [pageData],
  );

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
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 pt-5 pb-0">
      {/* Toolbar: search on the left; category and sort on the right. */}
      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={handleSearch} label="搜索 Skill" />

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

          {/* A search is ordered by relevance — the ranking is what decided
              these skills match — so the sort control is replaced by a static
              label instead of claiming an order the results do not follow.
              Clearing the search brings the choice back, still on whatever the
              user last picked for the browsed list. */}
          {query ? (
            <Button variant="outline" className="rounded-full px-4" disabled>
              相关度
            </Button>
          ) : (
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
          )}
        </div>
      </div>

      {/* The skill list; the modal detail drawer overlays it without reflowing
          it or moving its scroll position. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Results. The horizontal padding is sized for the macOS-style
              overlay scrollbar: a hovered (transformed) row is painted over the
              thumb, so the rows need reserved space on the right instead of
              sitting under it. Each padding is offset by a matching negative
              margin, so content position and row widths are unchanged while the
              outside-painted ink — the selected ring and the focus outline —
              stays unclipped; the 4px top pair does the same at the flush top
              edge. */}
          <div className="min-h-0 flex-1 -mx-3 -mt-1 overflow-y-auto px-3 pb-0 pt-1">
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
              <ul className={LIST_CLASS}>
                {hits.map((hit, i) => (
                  <SkillListRow
                    key={`${hit.skill.repo}/${hit.skill.name}`}
                    skill={hit.skill}
                    matched={hit.matched}
                    selected={i === selected}
                    onSelect={() => setSelected(i)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Pagination row: previous / numbered pages (with ellipsis) / next
              — the current page number doubles as an editable jump box — with
              the skill count pinned to the right (shared with the repos page).
              While the index is streaming in the count climbs, so say so, and a
              search says what ordered the list. */}
          {(stats.count > 0 || stats.complete) && (
            <ListPager
              page={page}
              totalPages={totalPages}
              onPage={handlePage}
              count={`共 ${total} 个${stats.complete ? "" : " · 加载中"}${
                stats.indexing ? " · 索引中" : ""
              }${query ? " · 按相关度" : ""}`}
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
