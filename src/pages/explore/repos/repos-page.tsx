import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

import { useRegistryRepos } from "../../../hooks/use-registry-repos";
import { useDebouncedValue } from "../../../hooks/use-debounced-value";
import { useRegistryStats } from "../../../hooks/use-registry-stats";
import type { RepoSortOrder } from "../../../lib/registry/protocol";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Input } from "../../../components/ui/input";
import { Skeleton } from "../../../components/ui/skeleton";
import { Placeholder } from "../explore-page";
import { ListPager } from "../../../components/list-pager";
import { RepoCard } from "./repo-card";

/** Number of repos shown per page in the paginated view. */
const PAGE_SIZE = 24;

/** Keystrokes settle this long before a search query reaches the worker. */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * The sort orders offered by the toolbar dropdown. "stars" (the default)
 * puts the most-starred repositories first, repo name as the tie-break.
 */
const SORT_OPTIONS: Array<{ value: RepoSortOrder; label: string }> = [
  { value: "stars", label: "按 Star 数" },
  { value: "skills", label: "按 Skill 数" },
  { value: "name", label: "按名称" },
];

/**
 * Loading placeholder mirroring the repo grid: a viewport's worth of
 * card-shaped skeletons. The page stays on the skeleton until the whole
 * registry has landed — a repo's skill count over partial data is wrong.
 */
function ReposSkeleton() {
  return (
    <div
      className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden
    >
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} className="h-[118px] rounded-xl" />
      ))}
    </div>
  );
}

/**
 * The store's "repos" page: every source repository in the registry, each
 * card showing how many skills it contains. Data is aggregated, filtered,
 * sorted and paginated inside the registry worker (see `getRepos`).
 */
export function ReposPage() {
  // 1-based current page.
  const [page, setPage] = useState(1);

  // Search text and sort order; any change resets the page, because the
  // result list (and the meaning of a card index) changes.
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<RepoSortOrder>("stars");
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

  // Download progress: the failure message and retry live here, since the
  // repos query itself is gated until the worker is ready.
  const stats = useRegistryStats();

  const {
    data,
    isPending,
    isError,
    error,
    refetch: refetchRepos,
  } = useRegistryRepos(query, sort, page - 1, PAGE_SIZE);

  const repos = data?.repos ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A background refetch can shrink the list below the current page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // The gated query reports the download failure only once there is nothing
  // to show; a mid-session source switch keeps serving the old dataset.
  const failure =
    stats.error ?? (isError && error instanceof Error ? error.message : null);

  // Skeleton until the full registry has landed (the query stays disabled
  // before that) — unless the download failed outright.
  const loading = !stats.ready && !failure;

  const handleSearch = (q: string) => {
    setPage(1);
    setSearch(q);
  };
  const handleSort = (order: RepoSortOrder) => {
    setPage(1);
    setSort(order);
  };
  const handlePage = (p: number) => {
    setPage(p);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 pt-5 pb-0">
      {/* Toolbar: search on the left; sort on the right. */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索仓库..."
            aria-label="搜索仓库"
            className="h-9 rounded-full pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
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
                onValueChange={(value) => handleSort(value as RepoSortOrder)}
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

      {/* Repo grid. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Symmetric 12px horizontal padding (offset by matching
              negative margins, so content position and card widths are
              unchanged) reserves room beside the cards for the overlay
              scrollbar instead of letting it overlap them, and keeps the
              outside-painted ink unclipped. */}
          <div className="min-h-0 flex-1 -mx-3 -mt-1 overflow-y-auto px-3 pb-0 pt-1">
            {failure ? (
              <Placeholder message={`加载失败：${failure}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    stats.refetch();
                    void refetchRepos();
                  }}
                >
                  重试
                </Button>
              </Placeholder>
            ) : loading || isPending ? (
              <ReposSkeleton />
            ) : repos.length === 0 ? (
              <Placeholder
                message={query ? `未找到匹配“${query}”的仓库` : "暂无仓库"}
              />
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {repos.map((repo) => (
                  <RepoCard key={repo.repo} repo={repo} />
                ))}
              </div>
            )}
          </div>

          {/* Pagination row with the repo count pinned to the right. */}
          {stats.ready && (
            <ListPager
              page={page}
              totalPages={totalPages}
              onPage={handlePage}
              count={`共 ${total} 个仓库`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
