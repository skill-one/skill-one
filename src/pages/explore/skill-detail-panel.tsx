import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Star, X } from "lucide-react";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { openExternal } from "../../lib/open-external";
import { formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Markdown } from "../../components/markdown";
import { OwnerAvatar } from "../../components/owner-avatar";

interface SkillDetailPanelProps {
  /** The skill to show; null renders nothing. */
  skill: Skill | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Fixed right-hand detail panel shown next to the skill grid in a split
 * layout. Switching skills happens by clicking another card in the left
 * grid. Escape or the X button closes the panel and restores the
 * full-width grid. Each skill's SKILL.md is fetched through TanStack Query
 * and cached independently, so revisits are instant.
 */
export function SkillDetailPanel({
  skill,
  onPrev,
  onNext,
  onClose,
}: SkillDetailPanelProps) {
  const {
    data: detail,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["skill-detail", skill?.repo, skill?.name],
    queryFn: () => fetchSkillDetail(skill!.repo, skill!.name, skill!.path),
    enabled: skill != null,
  });

  // Escape closes the panel; ←/→ switch skills (delegated to the page).
  useEffect(() => {
    if (!skill) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skill, onPrev, onNext, onClose]);

  if (!skill) return null;

  const owner = skill.repo.split("/")[0];
  const description = detail?.description || skill.description;
  // Link to the skill's folder in GitHub; without a known path, the repo root.
  const sourcePath = skill.path?.replace(/^\/+|\/+$/g, "");
  const sourceHref = sourcePath
    ? `https://github.com/${skill.repo}/tree/HEAD/${sourcePath}`
    : `https://github.com/${skill.repo}`;
  // Repo-relative SKILL.md path, reused for the GitHub file link and to
  // resolve relative URLs inside the markdown body.
  const filePath = detail?.path.replace(/^\/+|\/+$/g, "") ?? "";

  return (
    <aside
      role="complementary"
      aria-label="技能详情"
      className="flex h-full w-[440px] shrink-0 animate-in slide-in-from-right flex-col border-l border-border bg-card duration-200"
    >
      <div className="flex flex-col gap-4 border-b border-border p-6 pb-5">
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            aria-label="关闭"
            className="h-7 w-7 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <OwnerAvatar owner={owner} className="h-11 w-11 text-[18px]" />
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold tracking-tight text-foreground">
              {skill.name}
            </h2>
            <a
              href={sourceHref}
              onClick={(e) => {
                e.preventDefault();
                void openExternal(sourceHref);
              }}
              title="在 GitHub 中打开该技能的目录"
              className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="truncate">{skill.repo}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
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
              {formatCount(skill.downloads)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-medium tabular-nums">
              {formatCount(skill.stars)}
            </span>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
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
          <div className="flex flex-col gap-5">
            {description && (
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            <div>
              <a
                href={`https://github.com/${skill.repo}/blob/HEAD/${filePath}`}
                onClick={(e) => {
                  e.preventDefault();
                  void openExternal(
                    `https://github.com/${skill.repo}/blob/HEAD/${filePath}`,
                  );
                }}
                title="在 GitHub 中打开 SKILL.md"
                className="mb-2 flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <span className="truncate">{detail.path}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              {detail.instructions ? (
                <Markdown repo={skill.repo} filePath={filePath}>
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
    </aside>
  );
}
