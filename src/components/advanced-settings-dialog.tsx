import { useState } from "react";
import { Check } from "lucide-react";

import {
  DEFAULT_CDN_BASE,
  getCdnBase,
  getIndexTag,
  setCdnBase,
} from "../lib/cdn-config";
import { reloadRegistry } from "../lib/registry/client";
import { checkForRegistryUpdate } from "../lib/registry/refresh";
import type {
  IndexOrigin,
  RevalidateStatus,
} from "../lib/registry/protocol";
import { useRegistrySnapshot } from "../hooks/use-registry-snapshot";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

/** How the served snapshot got here, phrased for the advanced settings. */
const INDEX_ORIGIN_LABEL: Record<IndexOrigin, string> = {
  updated: "已下载最新索引",
  unchanged: "索引未更新，已复用本地缓存",
  cache: "正在校验本地缓存…",
};

/** Outcome of a manual freshness check, phrased for the advanced settings. */
const CHECK_LABEL: Record<RevalidateStatus, string> = {
  updated: "发现新快照，已在后台更新",
  current: "已是最新快照",
  unknown: "检测失败，请稍后重试",
};

/**
 * Second-level settings dialog, reached from the settings popover's 高级设置
 * row. It holds the two heavyweight sections that do not fit the one-glance
 * popover: the configurable CDN download source and the registry snapshot
 * currently in use.
 *
 * The CDN base is persisted to localStorage; `""` means "direct GitHub first"
 * (with the default CDN as a fallback). SKILL.md / install fetches read the
 * value live; the registry worker is told to reload its index from the new
 * source immediately (it has no `localStorage` access, so the base is
 * passed in).
 *
 * The data-source card is the read-out for run-based caching: it names the
 * snapshot the dataset is serving and whether this launch re-downloaded or
 * reused the local copy. Its button is the manual escape hatch — a reload
 * always re-downloads, even when the published run has not moved.
 */
export function AdvancedSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState(getCdnBase());
  const [saved, setSaved] = useState(false);
  // Outcome of the last manual check, or "checking" while it is in flight.
  const [check, setCheck] = useState<RevalidateStatus | "checking" | null>(
    null,
  );
  // Only the served snapshot identity drives this card; count climbs and
  // progress flags during a streaming download must not re-render the dialog.
  const index = useRegistrySnapshot((s) => s.index);

  const apply = (next: string) => {
    const previous = getCdnBase();
    setCdnBase(next);
    setValue(getCdnBase());
    setSaved(true);
    // A source switch invalidates the downloaded registry: re-fetch it.
    if (previous !== next) reloadRegistry();
  };

  // A user-initiated check skips the freshness window — asking is the point.
  const checkNow = async () => {
    setCheck("checking");
    const result = await checkForRegistryUpdate({ force: true });
    setCheck(result?.status ?? "unknown");
  };

  // Facts about the snapshot the store is actually serving. The
  // `dist-<date>[-N]` tag is short enough to display whole and to diff
  // against a release. A recorded tag (persisted by the registry client)
  // stands in until the live snapshot identity arrives, so a fresh session
  // still names its snapshot.
  const indexRows = [
    {
      term: "快照",
      value: index?.tag ?? (getIndexTag() || "未知"),
    },
    { term: "发布于", value: formatIndexTime(index?.generatedAt) },
    { term: "条目数", value: formatTotal(index?.total) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>高级设置</DialogTitle>
          <DialogDescription>
            配置技能数据的下载源（索引、SKILL.md 详情、安装统一生效）。
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-2 flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-2">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => apply("")}>
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

          <div className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-medium text-foreground">
                  数据源
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  商店数据来自两个 GitHub
                  仓库发布的每日快照。启动时自动校验、之后每日静默更新，无需手动干预。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={check === "checking"}
                  onClick={() => void checkNow()}
                >
                  {check === "checking" ? "正在检测…" : "检测更新"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => reloadRegistry()}
                >
                  立即重新下载
                </Button>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
              <div className="contents">
                <dt className="pt-1 font-medium text-foreground">
                  技能数据源
                  <span className="ml-1 font-normal text-muted-foreground">
                    （skills-profiles）
                  </span>
                </dt>
                <dd className="pt-1" />
              </div>
              {indexRows.map(({ term, value: detail }) => (
                <div key={term} className="contents">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="min-w-0 break-all text-foreground">
                    {detail}
                  </dd>
                </div>
              ))}
              <div className="contents">
                <dt className="pt-2 text-muted-foreground">上次校验</dt>
                <dd className="pt-2 text-foreground">
                  {formatCheckedAt(index?.checkedAt)}
                </dd>
              </div>
            </dl>
            {/* One freshness read-out for both the automatic and the manual
                path: the manual check's outcome while one is showing,
                otherwise how the served snapshot got here. Two lines would
                just say the same thing twice. */}
            <p
              role={check === "unknown" ? "alert" : undefined}
              className={`mt-2 text-[12px] ${
                check === "unknown"
                  ? "text-destructive"
                  : check === "updated"
                    ? "text-primary"
                    : "text-muted-foreground"
              }`}
            >
              {check && check !== "checking"
                ? CHECK_LABEL[check]
                : index
                  ? INDEX_ORIGIN_LABEL[index.origin]
                  : "数据尚未就绪"}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Upstream UTC stamp rendered in the user's locale and time zone. */
function formatIndexTime(iso?: string): string {
  if (!iso) return "未知";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "未知" : new Date(ms).toLocaleString();
}

/** A ms-epoch stamp rendered in the user's locale and time zone. */
function formatCheckedAt(ms?: number): string {
  return ms === undefined ? "未知" : new Date(ms).toLocaleString();
}

/** Digits with thousands separators; a published count should not be fuzzy. */
function formatTotal(total?: number): string {
  return total === undefined
    ? "未知"
    : new Intl.NumberFormat("en").format(total);
}
