import { useEffect } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { useInstalledSkills } from "../hooks/use-installed-skills";
import { isTauri } from "../lib/tauri";
import {
  MY_SKILLS_PATH,
  POPOVER_NAVIGATE_EVENT,
  skillPath,
} from "./popover-events";
import { useSkillsLiveSync } from "./use-skills-live-sync";

/**
 * Menu bar popover: a titled header (enabled count), the installed and
 * enabled skills, and one button into the main app.
 *
 * Disabled skills belong to the main window's management page, not a
 * glanceable list, so they are filtered out here. Clicking an entry deep
 * links into the my-skills page with that skill pre-filtered; the footer
 * button opens the same page unfiltered. The window size is fixed (see
 * `tauri.conf.json`); the frosted-glass panel is the native vibrancy
 * material applied by Rust (`tray.rs`), so nothing is drawn behind the
 * content.
 *
 * Dismissal: the native side hides the window on focus loss; Escape is the
 * keyboard equivalent (hidden via the core window API).
 */
export function PopoverPage() {
  useSkillsLiveSync();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTauri()) void getCurrentWindow().hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data, isLoading, isError, error } = useInstalledSkills();
  const skills = (data ?? []).filter((skill) => skill.enabled);

  return (
    <div className="flex h-screen flex-col">
      {/* Header: app title + enabled count, matching the screenshot the user
          approved. Hidden while loading / on error since the count is empty. */}
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-muted">
          <Sparkles className="size-3.5 text-muted-foreground" />
        </span>
        <h1 className="text-sm font-semibold">Skill One</h1>
        {!isLoading && !isError && (
          <span className="ml-auto text-xs text-muted-foreground">
            {skills.length} 个技能
          </span>
        )}
      </header>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {isError ? (
          <Notice
            title="技能列表加载失败"
            detail={error instanceof Error ? error.message : "未知错误"}
          />
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center">
            <LoaderCircle className="animate-spin text-muted-foreground" />
          </div>
        ) : skills.length === 0 ? (
          <Notice title="没有已启用的技能" detail="在主应用中安装或启用一个吧" />
        ) : (
          <ul>
            {skills.map((skill) => (
              <li key={skill.name}>
                <button
                  type="button"
                  onClick={() => {
                    if (isTauri())
                      void emit(POPOVER_NAVIGATE_EVENT, {
                        path: skillPath(skill.name),
                      });
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                >
                  <p className="truncate text-sm font-medium">{skill.name}</p>
                  {skill.description && (
                    <p className="truncate text-xs text-muted-foreground">
                      {skill.description}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="p-2">
        <Button
          className="w-full"
          onClick={() => {
            if (isTauri())
              void emit(POPOVER_NAVIGATE_EVENT, { path: MY_SKILLS_PATH });
          }}
        >
          打开 Skill One
        </Button>
      </footer>
    </div>
  );
}

/** Centered empty / error state: one message, one hint. */
function Notice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
