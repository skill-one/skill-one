import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
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

/** i18n keys for how the served snapshot got here. */
const INDEX_ORIGIN_KEY: Record<IndexOrigin, ParseKeys> = {
  updated: "advanced.origin.updated",
  unchanged: "advanced.origin.unchanged",
  cache: "advanced.origin.cache",
};

/** i18n keys for the outcome of a manual freshness check. */
const CHECK_KEY: Record<RevalidateStatus, ParseKeys> = {
  updated: "advanced.checkResult.updated",
  current: "advanced.checkResult.current",
  unknown: "advanced.checkResult.unknown",
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
  const { t } = useTranslation();
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
  const indexRows: { termKey: ParseKeys; value: string }[] = [
    {
      termKey: "advanced.snapshot",
      value: index?.tag ?? (getIndexTag() || t("common.unknown")),
    },
    {
      termKey: "advanced.publishedAt",
      value: formatIndexTime(index?.generatedAt, t("common.unknown")),
    },
    {
      termKey: "advanced.entryCount",
      value: formatTotal(index?.total, t("common.unknown")),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("advanced.title")}</DialogTitle>
          <DialogDescription>
            {t("advanced.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-2 flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-2">
          <div className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <label
                htmlFor="cdn-base"
                className="block text-[13px] font-medium text-foreground"
              >
                {t("advanced.cdnTitle")}
              </label>
              {saved && (
                <span className="flex items-center gap-1 text-[12px] text-primary">
                  <Check className="h-3.5 w-3.5" />
                  {t("advanced.cdnSaved")}
                </span>
              )}
            </div>
            <p className="mb-3 mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {t("advanced.cdnHintBefore")}
              <span className="font-mono">raw.githubusercontent.com</span>
              {t("advanced.cdnHintAfter")}
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
              {t("advanced.cdnExampleBefore")}
              <span className="font-mono">{DEFAULT_CDN_BASE}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => apply("")}>
                {t("advanced.directGithub")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => apply(DEFAULT_CDN_BASE)}
              >
                {t("advanced.useDefaultCdn")}
              </Button>
              <Button size="sm" onClick={() => apply(value)}>
                {t("advanced.save")}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-medium text-foreground">
                  {t("advanced.dataSource")}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {t("advanced.dataSourceHint")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={check === "checking"}
                  onClick={() => void checkNow()}
                >
                  {check === "checking"
                    ? t("advanced.checkingNow")
                    : t("advanced.checkUpdate")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => reloadRegistry()}
                >
                  {t("advanced.redownload")}
                </Button>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
              <div className="contents">
                <dt className="pt-1 font-medium text-foreground">
                  {t("advanced.skillSource")}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {t("advanced.skillSourceNote")}
                  </span>
                </dt>
                <dd className="pt-1" />
              </div>
              {indexRows.map(({ termKey, value: detail }) => (
                <div key={termKey} className="contents">
                  <dt className="text-muted-foreground">{t(termKey)}</dt>
                  <dd className="min-w-0 break-all text-foreground">
                    {detail}
                  </dd>
                </div>
              ))}
              <div className="contents">
                <dt className="pt-2 text-muted-foreground">
                  {t("advanced.lastChecked")}
                </dt>
                <dd className="pt-2 text-foreground">
                  {formatCheckedAt(index?.checkedAt, t("common.unknown"))}
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
                ? t(CHECK_KEY[check])
                : index
                  ? t(INDEX_ORIGIN_KEY[index.origin])
                  : t("advanced.notReady")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Upstream UTC stamp rendered in the user's locale and time zone. */
function formatIndexTime(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? fallback : new Date(ms).toLocaleString();
}

/** A ms-epoch stamp rendered in the user's locale and time zone. */
function formatCheckedAt(ms: number | undefined, fallback: string): string {
  return ms === undefined ? fallback : new Date(ms).toLocaleString();
}

/** Digits with thousands separators; a published count should not be fuzzy. */
function formatTotal(total: number | undefined, fallback: string): string {
  return total === undefined
    ? fallback
    : new Intl.NumberFormat("en").format(total);
}
