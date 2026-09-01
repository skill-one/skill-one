import { useState } from "react";
import { Check, Folder, Trash2 } from "lucide-react";

import {
  DEFAULT_CDN_BASE,
  getCdnBase,
  setCdnBase,
} from "../../lib/cdn-config";
import { reloadRegistry } from "../../lib/registry/client";
import { removeProject } from "../../lib/projects";
import { useProjects } from "../../hooks/use-projects";
import { useProjectAdd } from "../../hooks/use-project-add";
import { AddProjectDialog } from "../../components/add-project-dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ThemeModeToggle } from "../../components/theme-mode-toggle";

/**
 * Settings page. Hosts the appearance picker and the configurable CDN
 * download source.
 *
 * The CDN base is persisted to localStorage; `""` means "direct GitHub first"
 * (with the default CDN as a fallback). SKILL.md / install fetches read the
 * value live; the registry worker is told to reload its index from the new
 * source immediately (it has no `localStorage` access, so the base is
 * passed in).
 */
export function SettingsPage() {
  const [value, setValue] = useState(getCdnBase());
  const [saved, setSaved] = useState(false);
  const projects = useProjects();
  const projectAdd = useProjectAdd();

  const apply = (next: string) => {
    const previous = getCdnBase();
    setCdnBase(next);
    setValue(getCdnBase());
    setSaved(true);
    // A source switch invalidates the downloaded registry: re-fetch it.
    if (previous !== next) reloadRegistry();
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[680px] flex-col px-8 py-5">
      <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
        设置
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        配置技能数据的下载源（索引、SKILL.md 详情、安装统一生效）。
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground/80">
        skillone v{__APP_VERSION__}
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h3 className="text-[13px] font-medium text-foreground">外观</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            选择应用的配色方案，「跟随系统」会随系统外观设置自动切换。
          </p>
          <div className="mt-3">
            <ThemeModeToggle />
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4">
          <h3 className="text-[13px] font-medium text-foreground">项目</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            管理项目级技能的安装目录。技能会安装到各项目的
            <span className="mx-1 font-mono">.agents/skills</span>
            下；在「我的 skills」里可把某个技能移到全局或某个项目。
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {projects.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                还没有添加项目。
              </p>
            ) : (
              projects.map((project) => (
                <div
                  key={project.path}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {project.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {project.path}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    title={`移除 ${project.name}`}
                    aria-label={`移除项目 ${project.name}`}
                    onClick={() => removeProject(project.path)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={projectAdd.start}
          >
            添加项目…
          </Button>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="cdn-base"
              className="block text-[13px] font-medium text-foreground"
            >
              CDN 基址
            </label>
            {saved && (
              <span className="flex items-center gap-1 text-[12px] text-primary">
                <Check className="h-3.5 w-3.5" />
                已保存
              </span>
            )}
          </div>
          <p className="mb-3 mt-1 text-[12px] leading-relaxed text-muted-foreground">
            留空 = 优先直连 GitHub（
            <span className="font-mono">raw.githubusercontent.com</span>
            ），连不上时回退到默认 CDN。填入自定义值后将优先使用它。
          </p>
          <Input
            id="cdn-base"
            value={value}
            placeholder={DEFAULT_CDN_BASE}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
          />
          <p className="mt-2 text-[12px] text-muted-foreground">
            示例：直连 GitHub 留空；默认 CDN 为{" "}
            <span className="font-mono">{DEFAULT_CDN_BASE}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => apply("")}
          >
            直连 GitHub
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => apply(DEFAULT_CDN_BASE)}
          >
            使用默认 CDN
          </Button>
          <Button size="sm" onClick={() => apply(value)}>
            保存
          </Button>
        </div>
      </div>

      <AddProjectDialog
        open={projectAdd.manualOpen}
        onOpenChange={projectAdd.setManualOpen}
      />
    </div>
  );
}