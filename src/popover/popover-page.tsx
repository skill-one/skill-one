import { useEffect } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { useInstalledSkills } from "../hooks/use-installed-skills";
import { skillDescription } from "../lib/i18n-content";
import { useAppLocale } from "../i18n/use-language";
import { errorMessage } from "../lib/utils";
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
 * `tauri.conf.json`); the panel backdrop is the native glass/vibrancy
 * material applied by Rust (`tray.rs`), so nothing is drawn behind the
 * content: `popover.css` re-tokens the shadcn colors to translucent system
 * values, and the root clips the content to the material's corner radius.
 *
 * Dismissal: the native side hides the window on focus loss; Escape is the
 * keyboard equivalent (hidden via the core window API).
 */
export function PopoverPage() {
  useSkillsLiveSync();
  const { t } = useTranslation();
  const locale = useAppLocale();

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
    <div className="flex h-screen flex-col overflow-hidden rounded-[var(--popover-radius)]">
      {/* Header: app title + enabled count, matching the screenshot the user
          approved. Hidden while loading / on error since the count is empty. */}
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-muted">
          <Sparkles className="size-3.5 text-muted-foreground" />
        </span>
        <h1 className="text-sm font-semibold">Skill One</h1>
        {!isLoading && !isError && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t("popover.skillCount", { count: skills.length })}
          </span>
        )}
      </header>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {isError ? (
          <Notice
            title={t("popover.loadFailed")}
            detail={errorMessage(error)}
          />
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center">
            <LoaderCircle className="animate-spin text-muted-foreground" />
          </div>
        ) : skills.length === 0 ? (
          <Notice title={t("popover.noneEnabled")} detail={t("popover.noneEnabledHint")} />
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
                  {skillDescription(skill, locale) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {skillDescription(skill, locale)}
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
          {t("popover.open")}
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
