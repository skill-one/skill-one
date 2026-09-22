import { useEffect, useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { SkeletonList } from "../../../components/skeleton-list";
import {
  SKILL_CARD_SKELETON_CLASS,
  SKILL_LIST_CLASS,
} from "../../../lib/skill-list-layout";
import { useRanking } from "../../../hooks/use-ranking";
import { RANKINGS, rankingById } from "../../../lib/registry/featured-rankings";
import { cn, errorMessage } from "../../../lib/utils";
import type { Skill } from "../../../types/skill";
import { Placeholder } from "../../../components/placeholder";
import { SkillDetailDrawer } from "../../../components/skill-detail/skill-detail-drawer";
import { SkillListRow } from "../skill-list-row";
import { skillKey } from "../../../lib/skill-view";

/** Where the back button points; the tabs live under the same route. */
const FEATURED_PATH = "/explore/featured";
const RANKING_PATH = `${FEATURED_PATH}/ranking`;

/** Cards of the loading skeleton; roughly a viewport of the real list. */
const SKELETON_ROWS = 10;

/**
 * The landing page behind a featured banner: the full leaderboard behind one
 * hero slide, ranked inside the registry worker.
 *
 * The cards are the store's own (`SkillListRow`), unchanged: what makes this a
 * leaderboard is the order the worker put them in, not a rank chip or a
 * different metric glued on. The figure on each card is the same blended
 * popularity the store shows, so the two lists can never disagree about it.
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
  const [selected, setSelected] = useState<string | null>(null);
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
      <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 py-5">
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
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 py-5">
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
            message={`加载失败：${errorMessage(error)}`}
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
          // Mirrors the card list, so switching tabs never jumps.
          <SkeletonList
            rows={SKELETON_ROWS}
            listClassName={SKILL_LIST_CLASS}
            itemClassName={SKILL_CARD_SKELETON_CLASS}
          />
        ) : entries.length === 0 ? (
          <Placeholder message="暂无上榜 Skill" />
        ) : (
          <>
            <ol className={SKILL_LIST_CLASS}>
              {entries.map((entry) => (
                <SkillListRow
                  key={skillKey(entry.skill)}
                  skill={entry.skill}
                  selected={skillKey(entry.skill) === selected}
                  onSelect={() => setSelected(skillKey(entry.skill))}
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
