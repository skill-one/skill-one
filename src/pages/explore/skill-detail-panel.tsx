import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Star } from "lucide-react";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { openExternal } from "../../lib/open-external";
import { formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Markdown } from "../../components/markdown";
import { OwnerAvatar } from "../../components/owner-avatar";

interface SkillDetailPanelProps {
  /** The skill to show; null renders nothing. */
  skill: Skill | null;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Detail drawer for one skill, shown as a standard shadcn Sheet over the
 * right edge of the skill grid. The grid itself never reflows — opening or
 * closing the drawer leaves its layout and scroll position untouched. The
 * drawer is modal (dimmed overlay, focus trap, scroll lock); Escape, the
 * X button, or clicking the overlay closes it, and ←/→ switch skills.
 * Each skill's SKILL.md is fetched through TanStack Query and cached
 * independently, so revisits are instant.
 */
export function SkillDetailPanel({
  skill,
  onPrev,
  onNext,
}: SkillDetailPanelProps) {
  // Keep the last selected skill while the drawer plays its exit
  // animation: `skill` is already null by the time Radix starts closing,
  // and an unmounting parent would cut the slide-out short.
  const [lastSkill, setLastSkill] = useState<Skill | null>(skill);
  useEffect(() => {
    if (skill) setLastSkill(skill);
  }, [skill]);
  const shown = skill ?? lastSkill;

  const {
    data: detail,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["skill-detail", shown?.repo, shown?.name],
    queryFn: () => fetchSkillDetail(shown!.repo, shown!.name, shown!.path),
    enabled: shown != null,
  });

  // ←/→ switch skills (delegated to the page); Escape is Radix's dismiss.
  useEffect(() => {
    if (!skill) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skill, onPrev, onNext]);

  // Always render the SheetContent — Radix mounts and unmounts it with the
  // Sheet's open state, keeping the drawer alive through the close
  // animation. With no skill (and no latch yet) the drawer is empty, which
  // only happens before the first selection.
  const owner = shown?.repo.split("/")[0] ?? "";
  const description = detail?.description || shown?.description;
  // Link to the skill's folder in GitHub; without a known path, the repo root.
  const sourcePath = shown?.path?.replace(/^\/+|\/+$/g, "");
  const sourceHref = !shown
    ? ""
    : sourcePath
      ? `https://github.com/${shown.repo}/tree/HEAD/${sourcePath}`
      : `https://github.com/${shown.repo}`;
  // Repo-relative SKILL.md path, reused for the GitHub file link and to
  // resolve relative URLs inside the markdown body.
  const filePath = detail?.path.replace(/^\/+|\/+$/g, "") ?? "";

  return (
    <SheetContent side="right" className="flex flex-col">
      <SheetHeader>
        <OwnerAvatar owner={owner} className="h-11 w-11 text-[18px]" />
        <SheetTitle className="truncate">{shown?.name}</SheetTitle>
        <SheetDescription asChild>
          <a
            href={sourceHref}
            onClick={(e) => {
              e.preventDefault();
              void openExternal(sourceHref);
            }}
            title="在 GitHub 中打开该技能的目录"
            className="min-w-0 items-center gap-1"
          >
            <span className="truncate">{shown?.repo}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {detail?.version && (
            <Badge variant="secondary">v{detail.version}</Badge>
          )}
          {detail?.license && (
            <Badge variant="secondary">{detail.license}</Badge>
          )}
          {detail?.author && <Badge variant="secondary">{detail.author}</Badge>}
          <span className="ml-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
            <Download className="h-3.5 w-3.5" />
            <span className="font-medium tabular-nums">
              {formatCount(shown?.downloads ?? 0)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-medium tabular-nums">
              {formatCount(shown?.stars ?? 0)}
            </span>
          </span>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              加载失败：
              {error instanceof Error ? error.message : "未知错误"}
              <br />
              该仓库可能没有可访问的 SKILL.md。
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => void refetch()}
            >
              重试
            </Button>
          </div>
        ) : detail ? (
          <div className="flex flex-col gap-5 pt-2">
            {description && (
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            <div>
              <a
                href={`https://github.com/${shown?.repo}/blob/HEAD/${filePath}`}
                onClick={(e) => {
                  e.preventDefault();
                  void openExternal(
                    `https://github.com/${shown?.repo}/blob/HEAD/${filePath}`,
                  );
                }}
                title="在 GitHub 中打开 SKILL.md"
                className="mb-2 flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <span className="truncate">{detail.path}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              {detail.instructions ? (
                <Markdown repo={shown?.repo ?? ""} filePath={filePath}>
                  {detail.instructions}
                </Markdown>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  （SKILL.md 无正文内容）
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </SheetContent>
  );
}
