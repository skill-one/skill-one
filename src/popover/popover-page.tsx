import { useEffect, useLayoutEffect, useRef } from "react";
import { emit } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Puzzle, Sparkles, Store, TriangleAlert } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Skeleton } from "../components/ui/skeleton";
import { useInstalledSkills } from "../hooks/use-installed-skills";
import { isTauri } from "../lib/tauri";
import { POPOVER_NAVIGATE_EVENT, STORE_PATH } from "./popover-events";

/** Fixed popover width; must match the window config in tauri.conf.json. */
const POPOVER_WIDTH = 320;
/** Dynamic height clamp: compact for a few skills, scrollable beyond MAX. */
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 480;

/**
 * Read-only menu bar popover: installed skills at a glance, one button to
 * jump into the store. All management stays in the main window — the footer
 * button asks Rust to focus it and the main window routes itself to the store
 * page (see `popover-events.ts`).
 *
 * Visuals stay inside the app's shadcn tokens. The frosted-glass background
 * is the native popover vibrancy material applied by Rust (`tray.rs`); the
 * panel itself stays transparent and only draws the hairline border, rounded
 * to the same 16pt radius as the vibrancy view.
 *
 * The window height follows its content (clamped to MIN/MAX): the list is
 * measured after every load and the window resized — the native side reads
 * the live size on each tray toggle, so anchoring stays correct.
 *
 * Dismissal: the native side hides the window on focus loss; Escape is the
 * keyboard equivalent (hidden via the core window API).
 */
export function PopoverPage() {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTauri()) void getCurrentWindow().hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data, isLoading, isError, error } = useInstalledSkills();
  const skills = data ?? [];

  useLayoutEffect(() => {
    if (!isTauri()) return;
    // Wait one frame so the measurement reflects the rendered list.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const list = listRef.current;
      if (!panel || !list) return;
      // The list is the only flexible part of the column: swap its clipped
      // height for its natural content height to get the ideal window size.
      const natural = panel.offsetHeight - list.clientHeight + list.scrollHeight;
      const target = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, natural));
      if (Math.abs(target - panel.offsetHeight) <= 1) return;
      void getCurrentWindow().setSize(new LogicalSize(POPOVER_WIDTH, target));
    });
    return () => cancelAnimationFrame(frame);
  }, [data, isLoading, isError]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent">
      <div
        ref={panelRef}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-transparent text-popover-foreground"
      >
        <header className="flex items-center gap-2 px-3 pb-2 pt-2.5">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="size-3.5 text-primary" />
          </span>
          <h1 className="text-[13px] font-semibold">SkillOne</h1>
          {!isLoading && !isError && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              {skills.length} 个技能
            </span>
          )}
        </header>
        <Separator />
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {isError ? (
            <Notice
              icon={<TriangleAlert className="size-5" />}
              title="技能列表加载失败"
              detail={error instanceof Error ? error.message : "未知错误"}
            />
          ) : isLoading ? (
            <div className="flex flex-col gap-0.5">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 w-2/5" />
                    <Skeleton className="h-2.5 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : skills.length === 0 ? (
            <Notice
              icon={<Puzzle className="size-5" />}
              title="还没有安装任何 skill"
              detail="去商店逛逛，挑一个装上吧"
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {skills.map((skill) => (
                <div
                  key={skill.name}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Puzzle className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium leading-tight">
                      {skill.name}
                    </p>
                    {skill.description && (
                      <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                        {skill.description}
                      </p>
                    )}
                  </div>
                  <Badge variant={skill.enabled ? "default" : "secondary"} className="shrink-0">
                    {skill.enabled ? "启用" : "停用"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        <Separator />
        <footer className="px-3 pb-2.5 pt-2">
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              if (isTauri()) void emit(POPOVER_NAVIGATE_EVENT, { path: STORE_PATH });
            }}
          >
            <Store />
            打开商店
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** Centered empty / error state: an invitation, not a dead end. */
function Notice({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-4 text-center">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
        {icon}
      </span>
      <p className="text-[13px] font-medium">{title}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}
