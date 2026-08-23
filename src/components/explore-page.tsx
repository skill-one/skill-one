import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SearchX, Loader2 } from "lucide-react";

import { fetchSkillsPage } from "../lib/skills-api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { SkillCard } from "./skill-card";
import { SkillDetailPanel } from "./skill-detail-panel";

/**
 * Number of skills rendered per batch. A raw page holds 200 skills; mounting
 * all of them at once is wasteful, so only this many are rendered initially
 * and more are appended as the user scrolls.
 */
const RENDER_CHUNK = 30;

/**
 * The persisted cache key for the explore list. The sync-storage persister
 * keeps this query in localStorage forever (`gcTime`/`maxAge: Infinity`), so
 * bumping the version invalidates caches captured from an older data source
 * or with a stale `hasMore` state — otherwise a stale cache would freeze
 * infinite pagination after a data-source switch.
 */
const SKILLS_QUERY_KEY = ["skills", 2] as const;

function Placeholder({
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

const tabClass =
  "rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2 pt-1.5 shadow-none transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground text-muted-foreground hover:text-foreground";

export function ExplorePage() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: SKILLS_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchSkillsPage(pageParam),
    initialPageParam: 0,
    // Pages are fetched sequentially and appended in order, so the next page
    // index equals the number of pages loaded so far.
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.hasMore ? allPages.length : undefined,
  });

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Flatten the fetched pages (in fetch order) into the card list.
  const skills = useMemo(
    () => data?.pages.flatMap((p) => p.skills) ?? [],
    [data],
  );

  // Number of skills rendered so far. Grows by RENDER_CHUNK as the user
  // scrolls, so only a slice of each raw 200-skill page is ever mounted.
  const [visibleCount, setVisibleCount] = useState(RENDER_CHUNK);
  const visibleSkills = skills.slice(0, visibleCount);

  // Index into `skills` of the skill shown in the detail panel; null keeps
  // the panel closed (full-width grid). Clicking a card while the panel is
  // open simply swaps the selection, so switching skills never replays the
  // slide-in animation.
  const [selected, setSelected] = useState<number | null>(null);
  const selectedSkill = selected != null ? (skills[selected] ?? null) : null;

  const handlePrev = () =>
    setSelected((i) => (i == null ? i : Math.max(0, i - 1)));

  const handleNext = () => {
    if (selected == null) return;
    const next = selected + 1;
    if (next >= skills.length) return;
    // Navigating past the rendered slice reveals another batch of cards.
    if (next >= visibleCount) {
      setVisibleCount((c) => Math.min(skills.length, c + RENDER_CHUNK));
    }
    setSelected(next);
  };

  // Registry-wide total reported by the API, stable across pages. In
  // plain-browser dev this comes from the mock snapshot and reports the number
  // of skills the snapshot actually holds; it is null past the snapshot, in
  // which case the header line simply omits the count.
  const total = data?.pages[0]?.total ?? null;

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
    const card = gridRef.current?.children[selected] as
      | HTMLElement
      | undefined;
    card?.scrollIntoView({ block: "start" });
  }, [selected]);

  // Render the next batch once the sentinel approaches the visible area.
  // The sentinel lives inside the scrollable list, so it is observed against
  // that container (root) rather than the window: with a window root a broken
  // height chain inside a WebView can leave the sentinel permanently
  // "offscreen" and freeze pagination. rootMargin widens the trigger area
  // well before the list actually ends.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollRoot = scrollRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => Math.min(skills.length, c + RENDER_CHUNK));
        }
      },
      { root: scrollRoot, rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [skills.length]);

  // Belt-and-braces fallback for WebViews whose IntersectionObserver callback
  // fires unreliably (notably WKWebView): also grow the rendered batch when
  // the list is scrolled close to its end, so the prefetch effect below can
  // never stall waiting for an intersection event.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) {
        setVisibleCount((c) => Math.min(skills.length, c + RENDER_CHUNK));
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [skills.length]);

  // Once everything fetched so far has been rendered, pull in the next raw
  // page of 200 skills from the registry. Guarded on skills.length > 0 so the
  // initial load (which useInfiniteQuery performs itself) is never doubled.
  useEffect(() => {
    if (
      skills.length > 0 &&
      visibleCount >= skills.length &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage();
    }
  }, [
    visibleCount,
    skills.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      <Tabs defaultValue="explore" className="flex h-full flex-col">
        <TabsList className="h-auto w-full justify-start gap-7 border-b border-border bg-transparent p-0">
          <TabsTrigger value="explore" className={tabClass}>
            在线探索
          </TabsTrigger>
          <TabsTrigger value="git" className={tabClass}>
            Git 仓库
          </TabsTrigger>
          <TabsTrigger value="local" className={tabClass}>
            本地目录
          </TabsTrigger>
        </TabsList>

        {/* NOTE: keep `flex` off this element — Tailwind's `.flex` would
            override the `[hidden]` attribute on inactive tabs and make every
            panel render at once. The layout is delegated to an inner wrapper. */}
        <TabsContent value="explore" className="mt-0 min-h-0 flex-1">
          {/* Split layout: skill grid on the left, fixed detail panel on the
              right while a skill is selected. */}
          <div className="flex h-full min-h-0 flex-row">
            <div className="flex h-full min-w-0 flex-1 flex-col">
              {/* Hint line */}
              <p className="pb-4 text-[12px] leading-relaxed text-muted-foreground/90">
                数据来自{" "}
                <span className="font-medium text-muted-foreground">
                  skills.sh
                </span>{" "}
                注册表
                {total != null && <> · 共 {total.toLocaleString()} 个技能</>}·
                滚动到底部自动加载更多
              </p>

              {/* Grid */}
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1"
              >
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
                ) : visibleSkills.length === 0 ? (
                  isLoading ? (
                    <div className="flex h-full min-h-[320px] items-center justify-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <Placeholder message="暂无技能" />
                  )
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
                    {visibleSkills.map((skill, index) => (
                      <SkillCard
                        key={`${skill.repo}/${skill.name}`}
                        skill={skill}
                        selected={index === selected}
                        onSelect={() => setSelected(index)}
                      />
                    ))}
                  </div>
                )}

                {/* Always-mounted sentinel so the render observer never misses it. */}
                <div ref={sentinelRef} aria-hidden="true" />
                {visibleSkills.length > 0 && isFetchingNextPage && (
                  <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[12px]">加载中...</span>
                  </div>
                )}
                {visibleSkills.length > 0 &&
                  !isFetchingNextPage &&
                  !hasNextPage && (
                    <p className="py-6 text-center text-[12px] text-muted-foreground/80">
                      已加载全部技能
                    </p>
                  )}
              </div>
            </div>

            <SkillDetailPanel
              skill={selectedSkill}
              onPrev={handlePrev}
              onNext={handleNext}
              onClose={() => setSelected(null)}
            />
          </div>
        </TabsContent>

        <TabsContent value="git" className="mt-0 min-h-0 flex-1">
          <Placeholder message="通过 Git 仓库添加技能 — 即将上线" />
        </TabsContent>

        <TabsContent value="local" className="mt-0 min-h-0 flex-1">
          <Placeholder message="从本地目录扫描技能 — 即将上线" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
