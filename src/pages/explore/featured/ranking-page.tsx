import { useEffect, useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import { OwnerAvatar } from "../../../components/owner-avatar";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { useRanking } from "../../../hooks/use-ranking";
import { RANKINGS, rankingById, type RankEntry } from "../../../lib/registry/featured-rankings";
import { cn } from "../../../lib/utils";
import type { Skill } from "../../../types/skill";
import { Placeholder } from "../../../components/placeholder";
import { SkillDetailDrawer } from "../../../components/skill-detail/skill-detail-drawer";
import { SkillInstallButton } from "../skill-install-button";

/** Where the back button points; the tabs live under the same route. */
const FEATURED_PATH = "/explore/featured";
const RANKING_PATH = `${FEATURED_PATH}/ranking`;

/** Rows of the loading skeleton; roughly a viewport of the real list. */
const SKELETON_ROWS = 10;

/**
 * Rank badge of a leaderboard row. The top three get a tinted chip and a
 * heavier weight; the rest recede into the background, so the eye lands on
 * the podium first without the list turning into a wall of accents.
 */
function RankBadge({ rank }: { rank: number }) {
  const podium =
    rank === 1
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : rank === 2
        ? "bg-slate-500/15 text-slate-600 dark:text-slate-300"
        : rank === 3
          ? "bg-amber-700/15 text-amber-800 dark:text-amber-600"
          : null;

  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] tabular-nums",
        podium ?? "text-muted-foreground/70",
        podium ? "font-bold" : "font-medium",
      )}
    >
      {rank}
    </span>
  );
}

/** One leaderboard row: the ranked skill, its metric and its install action. */
function RankingRow({
  entry,
  selected,
  onSelect,
}: {
  entry: RankEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { skill } = entry;
  const owner = skill.repo.split("/")[0];

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-label={`查看 ${skill.name} 详情`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-all duration-150",
          "hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)]",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <RankBadge rank={entry.rank} />

        <OwnerAvatar owner={owner} className="h-10 w-10 text-[15px]" />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
              {skill.name}
            </h3>
            <span className="truncate text-[12px] text-muted-foreground">
              {skill.repo}
            </span>
          </div>
          <p className="mt-0.5 hidden truncate text-[13px] leading-relaxed text-muted-foreground lg:block">
            {skill.description || "暂无描述"}
          </p>
        </div>

        <span className="shrink-0 text-[13px] font-medium tabular-nums text-foreground">
          {entry.label}
        </span>

        {/* The install button stops its own click, so it never opens the
            detail drawer behind it. */}
        <SkillInstallButton skill={skill} />
      </div>
    </li>
  );
}

/** Loading placeholder mirroring the row list, so switching tabs never jumps. */
function RankingSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border/70 bg-card px-3.5 py-3"
        >
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="hidden h-3.5 w-3/4 lg:block" />
          </div>
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/**
 * The landing page behind a featured banner: the full leaderboard behind one
 * hero slide, ranked inside the registry worker.
 *
 * The leaderboard id lives in the URL, so the page is deep-linkable, the back
 * button returns to the featured page, and the tabs are plain links — cross
 * -cutting leaderboards never remounts the list or loses scroll position.
 */
export function RankingPage() {
  const { rankingId } = useParams<{ rankingId: string }>();
  const def = rankingId ? rankingById(rankingId) : undefined;

  // `isPending`, not `isLoading`: the query stays disabled until the worker
  // is ready, and a disabled query never fetches — so isLoading would be
  // false and the page would flash its empty state instead of the skeleton.
  const { data, isPending, isError, error, refetch } = useRanking(rankingId);

  const entries = data?.entries ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const skills: Skill[] = entries.map((entry) => entry.skill);

  // Switching leaderboards replaces the whole list, so any open drawer would
  // point at a skill that is no longer on screen. The drawer's modal overlay
  // already blocks the tabs, but the route can still change under an open
  // drawer — e.g. the menu-bar popover navigating by path.
  useEffect(() => {
    setSelected(null);
  }, [rankingId]);

  // An unknown id never reaches the worker (the query stays disabled), so it
  // is reported here rather than as a load failure.
  if (!def) {
    return (
      <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
        <Placeholder message={`榜单不存在：${rankingId ?? "未知"}`}>
          <Link to={FEATURED_PATH}>
            <Button variant="outline" size="sm" className="mt-2">
              返回精选
            </Button>
          </Link>
        </Placeholder>
      </div>
    );
  }

  const truncated = data != null && data.total > entries.length;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* One header row: back to the featured page, the leaderboard's own
          title, and the sibling leaderboards to switch between. The tabs
          stay pinned to the right edge; the title block gives way first. */}
      <header className="mb-5 flex items-center gap-2">
        <Link
          to={FEATURED_PATH}
          aria-label="返回精选"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-foreground">
            {def.title}
          </h1>
        </div>

        {/* Navigation styled after shadcn/ui's Tabs look (muted track,
            raised active pill) while staying plain links: the leaderboard
            id lives in the URL, so these are pages to navigate to, not
            in-place panels to switch. */}
        <nav
          aria-label="切换榜单"
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1"
        >
          {RANKINGS.map((ranking) => (
            <NavLink
              key={ranking.id}
              to={`${RANKING_PATH}/${ranking.id}`}
              end
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1 text-[13px] transition-all",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {ranking.title}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Symmetric 12px horizontal padding (offset by matching negative
          margins, so content position and row widths are unchanged)
          reserves room beside the rows for the overlay scrollbar instead
          of letting it overlap them. */}
      <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-6">
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
        ) : isPending ? (
          <RankingSkeleton />
        ) : entries.length === 0 ? (
          <Placeholder message="暂无上榜 Skill" />
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {entries.map((entry, i) => (
                <RankingRow
                  key={`${entry.skill.repo}/${entry.skill.name}`}
                  entry={entry}
                  selected={i === selected}
                  onSelect={() => setSelected(i)}
                />
              ))}
            </ol>
            <p className="pt-4 text-center text-[12px] text-muted-foreground tabular-nums">
              共 {data?.total ?? entries.length} 个 Skill
              {truncated ? ` · 展示前 ${entries.length} 名` : ""}
            </p>
          </>
        )}
      </div>

      {/* Modal detail drawer shared with the explore and featured pages;
          prev/next walks the leaderboard in rank order. */}
      <SkillDetailDrawer
        skills={skills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
