import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Star } from "lucide-react";

import { OwnerAvatar } from "../../../components/owner-avatar";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { useRegistryPage } from "../../../hooks/use-registry-page";
import { useRegistryStats } from "../../../hooks/use-registry-stats";
import { formatCount } from "../../../lib/utils";
import type { Skill } from "../../../types/skill";
import { Placeholder } from "../explore-page";
import { ListPager } from "../../../components/list-pager";
import { SkillListRow } from "../skill-list-row";
import { SkillDetailDrawer } from "../../../components/skill-detail/skill-detail-drawer";

/** Number of skills shown per page on the repo detail page. */
const PAGE_SIZE = 24;

/** Where the back button points; the repos list lives one level up. */
const REPOS_PATH = "/explore/repos";

/**
 * Loading placeholder mirroring the skill list, so opening a repo paints its
 * final layout instantly and real rows replace the placeholders as the data
 * arrives.
 */
function RepoDetailSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <Skeleton key={i} className="h-16 rounded-xl" />
      ))}
    </div>
  );
}

/**
 * The landing page behind a repos-page card: every registry skill that lives
 * in one source repository, paged inside the registry worker (an exact repo
 * filter, not a search). The repo id lives in the URL, so the page is
 * deep-linkable and the back button returns to the repos list.
 */
export function RepoDetailPage() {
  const { owner = "", repo = "" } = useParams<{
    owner: string;
    repo: string;
  }>();
  const repoId = `${owner}/${repo}`;

  // 1-based current page and the row index shown in the detail drawer.
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);

  // Worker progress: the climbing count and the retry action for a failed
  // download.
  const stats = useRegistryStats();

  const {
    data: pageData,
    isLoading,
    isError,
    error,
    refetch: refetchPage,
  } = useRegistryPage("", "default", page - 1, PAGE_SIZE, repoId);

  const hits = pageData?.hits ?? [];
  const pageSkills: Skill[] = useMemo(
    () => hits.map((hit) => hit.skill),
    [hits],
  );

  // Repo-level header facts from the first skill (same repo ⇒ same stars).
  const stars = hits[0]?.skill.stars ?? 0;

  // A download failure only owns the screen while there is nothing to show;
  // with data on screen the error surfaces in the footer count instead.
  const failure =
    stats.count === 0 && !stats.complete
      ? (stats.error ??
        (isError && error instanceof Error ? error.message : null))
      : null;

  // The skeleton stays up until the first skill arrives.
  const loading =
    isLoading || (hits.length === 0 && stats.count === 0 && !failure);

  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A background refetch can shrink the list below the current page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Switching repos replaces the whole list, so any open drawer would point
  // at a skill that is no longer on screen (e.g. the popover navigating).
  useEffect(() => {
    setSelected(null);
  }, [repoId]);

  const handlePage = (p: number) => {
    setSelected(null);
    setPage(p);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 pt-5 pb-0">
      {/* One header row: back to the repos list, the repo's avatar, its name
          and its star count. */}
      <header className="mb-5 flex items-center gap-2.5">
        <Link
          to={REPOS_PATH}
          aria-label="返回仓库列表"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <OwnerAvatar owner={owner} className="h-9 w-9 text-[15px]" />

        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold leading-tight tracking-tight text-foreground">
            {repoId}
          </h1>
          <p className="mt-0.5 flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium tabular-nums">
                {formatCount(stars)}
              </span>
            </span>
            <span>共 {total} 个 Skill</span>
          </p>
        </div>
      </header>

      {/* The skill list; the modal detail drawer overlays it without reflowing
          it or moving its scroll position. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Symmetric 12px horizontal padding (offset by matching
              negative margins, so content position and row widths are
              unchanged) reserves room beside the rows for the overlay
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
                    void refetchPage();
                  }}
                >
                  重试
                </Button>
              </Placeholder>
            ) : loading ? (
              <RepoDetailSkeleton />
            ) : hits.length === 0 ? (
              <Placeholder message={`仓库 ${repoId} 下暂无 Skill`} />
            ) : (
              <ul className="flex flex-col gap-2">
                {hits.map((hit, i) => (
                  <SkillListRow
                    key={`${hit.skill.repo}/${hit.skill.name}`}
                    skill={hit.skill}
                    selected={i === selected}
                    onSelect={() => setSelected(i)}
                  />
                ))}
              </ul>
            )}
          </div>

          {total > 0 && (
            <ListPager
              page={page}
              totalPages={totalPages}
              onPage={handlePage}
              count={`共 ${total} 个${stats.complete ? "" : " · 加载中"}`}
            />
          )}
        </div>
      </div>

      {/* Modal detail drawer shared with the explore and featured pages. */}
      <SkillDetailDrawer
        skills={pageSkills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
