import { useState } from "react";
import { Check } from "lucide-react";

import {
  DEFAULT_CDN_BASE,
  getCdnBase,
  setCdnBase,
} from "../../lib/cdn-config";
import { reloadRegistry } from "../../lib/registry/client";
import type { IndexOrigin } from "../../lib/registry/protocol";
import { useAppUpdate } from "../../hooks/use-app-update";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ThemeModeToggle } from "../../components/theme-mode-toggle";

/** How the served snapshot got here, phrased for the settings page. */
const INDEX_ORIGIN_LABEL: Record<IndexOrigin, string> = {
  updated: "本次启动已下载最新索引",
  unchanged: "索引未更新，已复用本地缓存",
  cache: "正在校验本地缓存…",
};

/**
 * Settings page. Hosts the appearance picker, the configurable CDN download
 * source, and the registry snapshot currently in use.
 *
 * The CDN base is persisted to localStorage; `""` means "direct GitHub first"
 * (with the default CDN as a fallback). SKILL.md / install fetches read the
 * value live; the registry worker is told to reload its index from the new
 * source immediately (it has no `localStorage` access, so the base is
 * passed in).
 *
 * The index card is the read-out for commit-based caching: it names the
 * snapshot being served and whether this launch re-downloaded it or reused the
 * local copy. Its button is the manual escape hatch — a reload always
 * re-downloads, even when the published commit has not moved.
 */
export function SettingsPage() {
  const [value, setValue] = useState(getCdnBase());
  const [saved, setSaved] = useState(false);
  const update = useAppUpdate();
  const { index } = useRegistryStats();

  const apply = (next: string) => {
    const previous = getCdnBase();
    setCdnBase(next);
    setValue(getCdnBase());
    setSaved(true);
    // A source switch invalidates the downloaded registry: re-fetch it.
    if (previous !== next) reloadRegistry();
  };

  // Facts about the snapshot the store is actually serving. A commit prefix
  // is enough to recognize it and to diff against a release, and the full sha
  // would only wrap.
  const indexRows = [
    {
      term: "索引版本",
      value: index?.commit ? index.commit.slice(0, 12) : "未知",
    },
    { term: "发布于", value: formatIndexTime(index?.generatedAt) },
    { term: "条目数", value: formatTotal(index?.total) },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-[680px] flex-col px-8 py-5">
      <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
        设置
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        配置技能数据的下载源（索引、SKILL.md 详情、安装统一生效）。
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground/80">
        Skill One v{__APP_VERSION__}
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
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-medium text-foreground">
                软件更新
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                启动时自动检查新版本（GitHub Releases，签名校验后安装），也可手动检查。
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={update.phase === "checking"}
              onClick={() => void update.check()}
            >
              {update.phase === "checking" ? "正在检查…" : "检查更新"}
            </Button>
          </div>
          {update.phase === "upToDate" && (
            <p className="mt-2 flex items-center gap-1 text-[12px] text-primary">
              <Check className="h-3.5 w-3.5" />
              已是最新版本。
            </p>
          )}
          {update.phase === "available" && (
            <p className="mt-2 text-[12px] text-primary">
              发现新版本 v{update.version}，可在更新弹窗中安装。
            </p>
          )}
          {update.phase === "error" && (
            <p role="alert" className="mt-2 text-[12px] text-destructive">
              {update.error}
            </p>
          )}
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

        <div className="rounded-xl border border-border/70 bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-medium text-foreground">
                技能索引
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                商店数据来自 skill-one/skills-index 发布的快照。索引按 commit
                定址：版本未变时启动直接复用本地缓存，不再下载全量数据。
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => reloadRegistry()}
            >
              立即重新下载
            </Button>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
            {indexRows.map(({ term, value: detail }) => (
              <div key={term} className="contents">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="min-w-0 break-all text-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {index ? INDEX_ORIGIN_LABEL[index.origin] : "索引尚未就绪"}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Upstream UTC stamp rendered in the user's locale and time zone. */
function formatIndexTime(iso?: string): string {
  if (!iso) return "未知";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "未知" : new Date(ms).toLocaleString();
}

/** Digits with thousands separators; a published count should not be fuzzy. */
function formatTotal(total?: number): string {
  return total === undefined ? "未知" : new Intl.NumberFormat("en").format(total);
}