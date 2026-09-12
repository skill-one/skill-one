import { useState, type ComponentType, type ReactNode } from "react";
import {
  Check,
  CircleAlert,
  CircleArrowUp,
  CircleCheck,
  LoaderCircle,
  Terminal,
} from "lucide-react";

import {
  DEFAULT_CDN_BASE,
  getCdnBase,
  getIndexTag,
  getProfilesTag,
  setCdnBase,
} from "../../lib/cdn-config";
import { reloadRegistry } from "../../lib/registry/client";
import { checkForRegistryUpdate } from "../../lib/registry/refresh";
import type {
  IndexOrigin,
  RevalidateStatus,
} from "../../lib/registry/protocol";
import { cn } from "../../lib/utils";
import { useAppUpdate } from "../../hooks/use-app-update";
import { useRegistrySnapshot } from "../../hooks/use-registry-snapshot";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ThemeModeToggle } from "../../components/theme-mode-toggle";

/** How the served snapshot got here, phrased for the settings page. */
const INDEX_ORIGIN_LABEL: Record<IndexOrigin, string> = {
  updated: "已下载最新索引",
  unchanged: "索引未更新，已复用本地缓存",
  cache: "正在校验本地缓存…",
};

/** Outcome of a manual freshness check, phrased for the settings page. */
const CHECK_LABEL: Record<RevalidateStatus, string> = {
  updated: "发现新快照，已在后台更新",
  current: "已是最新快照",
  unknown: "检测失败，请稍后重试",
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
 * The data-source card is the read-out for run-based caching: it names the
 * snapshot each source (registry index, profiles dataset) is serving and
 * whether this launch re-downloaded or reused the local copy. Its button is
 * the manual escape hatch — a reload always re-downloads, even when the
 * published runs have not moved.
 */
export function SettingsPage() {
  const [value, setValue] = useState(getCdnBase());
  const [saved, setSaved] = useState(false);
  // Outcome of the last manual check, or "checking" while it is in flight.
  const [check, setCheck] = useState<RevalidateStatus | "checking" | null>(
    null,
  );
  const update = useAppUpdate();
  // Only the served snapshot identity drives this card; count climbs and
  // progress flags during a streaming download must not re-render the page.
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

  // Facts about the snapshots the store is actually serving, one group per
  // GitHub source. The `dist-<date>` tag is short enough to display whole
  // and to diff against a release. A recorded tag (persisted by the
  // registry client) stands in until the live snapshot identity arrives,
  // so a fresh session still names its snapshots.
  const indexRows = [
    {
      term: "快照",
      value: index?.tag ?? (getIndexTag() || "未知"),
    },
    { term: "发布于", value: formatIndexTime(index?.generatedAt) },
    { term: "条目数", value: formatTotal(index?.total) },
  ];
  const profileRows = [
    {
      term: "快照",
      value: index?.profilesTag ?? (getProfilesTag() || "未知"),
    },
    { term: "发布于", value: formatIndexTime(index?.profilesAt) },
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

      {/* The cards scroll while the header stays put, like every other
          page's list region. The symmetric 12px horizontal padding (offset
          by matching negative margins) reserves room for the macOS-style
          overlay scrollbar at the same edge as the store pages. */}
      <div className="-mx-3 mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <div className="flex flex-col gap-4">
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
                  启动、切回前台以及每小时兜底自动检查新版本（GitHub
                  Releases，签名校验后安装），也可手动检查。
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={
                  update.phase === "checking" || update.phase === "managed"
                }
                onClick={() => void update.check({ force: true })}
              >
                {update.phase === "checking" ? "正在检查…" : "检查更新"}
              </Button>
            </div>
            {update.phase === "checking" && (
              <UpdateStatusLine
                icon={LoaderCircle}
                iconClassName="animate-spin"
                title="正在检查更新…"
              />
            )}
            {update.phase === "upToDate" && (
              <UpdateStatusLine
                icon={CircleCheck}
                tone="positive"
                title="已是最新版本。"
              />
            )}
            {/* The one state worth shouting about: tinted, two-line, and the
                only place in the card with a filled primary action. Every
                other phase stays a quiet line, so the card draws the eye
                exactly when there is something to do. */}
            {update.phase === "available" && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                  <CircleArrowUp className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-foreground">
                    有新版本 v{update.version}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    下载并重启即可完成安装。
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => update.open()}
                >
                  立即更新
                </Button>
              </div>
            )}
            {update.phase === "managed" && (
              <UpdateStatusLine
                icon={Terminal}
                title="此安装由 Homebrew 管理。"
                detail={
                  <code className="rounded bg-muted px-1 py-0.5">
                    brew upgrade --cask skill-one
                  </code>
                }
              />
            )}
            {update.phase === "error" && (
              <UpdateStatusLine
                icon={CircleAlert}
                tone="danger"
                role="alert"
                title={update.error}
              />
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
                  技能索引
                  <span className="ml-1 font-normal text-muted-foreground">
                    （skills-sh-mirror）
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
                <dt className="pt-2 font-medium text-foreground">
                  画像数据集
                  <span className="ml-1 font-normal text-muted-foreground">
                    （skills-profiles）
                  </span>
                </dt>
                <dd className="pt-2" />
              </div>
              {profileRows.map(({ term, value: detail }) => (
                <div key={term} className="contents">
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="min-w-0 break-all text-foreground">
                    {detail}
                  </dd>
                </div>
              ))}
              {/* One check covers both sources, so it reads outside the two
                  per-source groups. */}
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
      </div>
    </div>
  );
}

/**
 * A status entry under the 软件更新 header: state icon + one wrapping line, the
 * same shape for every phase that has nothing to act on (`available` gets the
 * callout above instead). Keeping the shape fixed means the card settles as a
 * check resolves rather than reflowing around whatever text appears.
 */
function UpdateStatusLine({
  icon: Icon,
  tone = "muted",
  iconClassName,
  role,
  title,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: "muted" | "positive" | "danger";
  iconClassName?: string;
  /** Announce the line: reserved for states the user must not miss. */
  role?: "alert";
  title: ReactNode;
  /** A second, quieter line — used for the fix-it command. */
  detail?: ReactNode;
}) {
  const tint = {
    muted: "text-muted-foreground",
    positive: "text-primary",
    danger: "text-destructive",
  }[tone];
  return (
    <div
      role={role}
      className={cn(
        "mt-2 flex items-start gap-2 text-[12px] leading-relaxed",
        tone === "danger" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("mt-px size-3.5 shrink-0", tint, iconClassName)} />
      <div className="min-w-0">
        <p>{title}</p>
        {detail && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
        )}
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
