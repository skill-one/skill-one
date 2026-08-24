import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchX, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

import { fetchSkillsPage } from "../lib/skills-api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "./ui/pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { SkillCard } from "./skill-card";
import { SkillDetailPanel } from "./skill-detail-panel";

/** Number of skills shown per page in the paginated registry view. */
const PAGE_SIZE = 24;

/**
 * The persisted cache key for the explore list. The sync-storage persister
 * keeps this query in localStorage forever (`gcTime`/`maxAge: Infinity`), so
 * bumping the version invalidates caches captured from an older data source
 * or with a stale page shape — otherwise a stale cache would freeze the list.
 */
const SKILLS_QUERY_KEY = ["skills", 3] as const;

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
  // 1-based current page; switching pages resets the open detail panel.
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...SKILLS_QUERY_KEY, page],
    queryFn: () => fetchSkillsPage(page - 1, PAGE_SIZE),
  });

  // The current page's skills; `total` is the registry-wide count reported by
  // the API (null past the mock snapshot in plain-browser dev), which drives
  // how many numbered pages exist.
  const skills = data?.skills ?? [];
  const total = data?.total ?? null;
  const totalPages =
    total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;

  // Index into `skills` of the skill shown in the detail panel; null keeps
  // the panel closed (full-width grid). Clicking a card while the panel is
  // open simply swaps the selection, so switching skills never replays the
  // slide-in animation.
  const [selected, setSelected] = useState<number | null>(null);
  const selectedSkill = selected != null ? (skills[selected] ?? null) : null;

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
                ) : skills.length === 0 ? (
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
                    {skills.map((skill, index) => (
                      <SkillCard
                        key={`${skill.repo}/${skill.name}`}
                        skill={skill}
                        selected={index === selected}
                        onSelect={() => setSelected(index)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination bar: previous / numbered pages (with ellipsis) /
                  next, plus an inline "jump to page" input — shown once a page
                  of data is available. */}
              {data && totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 border-t border-border py-2.5">
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
