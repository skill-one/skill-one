import { useState } from "react";
import { Check } from "lucide-react";

import {
  DEFAULT_CDN_BASE,
  getCdnBase,
  setCdnBase,
} from "../lib/cdn-config";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/**
 * Settings page. Currently hosts the configurable CDN download source.
 *
 * The CDN base is persisted to localStorage; `""` means "direct GitHub first"
 * (with the default CDN as a fallback). Changes take effect immediately on the
 * next fetch because index / SKILL.md / install all read the value live.
 */
export function SettingsPage() {
  const [value, setValue] = useState(getCdnBase());
  const [saved, setSaved] = useState(false);

  const apply = (next: string) => {
    setCdnBase(next);
    setValue(getCdnBase());
    setSaved(true);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[680px] flex-col px-8 py-5">
      <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
        设置
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        配置技能数据的下载源（索引、SKILL.md 详情、安装统一生效）。
      </p>

      <div className="mt-6 flex flex-col gap-4">
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
    </div>
  );
}