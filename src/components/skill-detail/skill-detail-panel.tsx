import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Puzzle, Star } from "lucide-react";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { fetchLocalSkillDetail } from "../../lib/local-skills";
import { openExternal } from "../../lib/open-external";
import { formatDate, formatCount, formatRev } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import { Markdown } from "../markdown";
import { OwnerAvatar } from "../owner-avatar";

interface SkillDetailPanelProps {
  /** The skill to show; null renders nothing. */
  skill: Skill | null;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Detail drawer for one skill, shown as a standard shadcn Drawer sliding
 * in from the right edge of the window. The grid itself never reflows —
 * opening or closing the drawer leaves its layout and scroll position
 * untouched. The drawer is modal (dimmed overlay, focus trap, scroll lock); Escape,
 * clicking the overlay, or dragging the drawer sideways closes it, and ←/→
 * switch skills. Each skill's SKILL.md is fetched through TanStack Query and
 * cached independently, so revisits are instant. The source is picked per
 * skill: a registry-known `path` reads from the GitHub repo (store pages),
 * while an installed skill without one — local skills included — is read from
 * the local skills directory instead, so the view always shows the copy the
 * user actually installed.
 *
 * The header's version identity (content fingerprint + the date the registry
 * first recorded it) comes from the index entry rather than the SKILL.md, so
 * unscanned entries and local installs simply show no such row.
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

  // Remote when the registry knows the skill's repo directory, local disk
  // otherwise (local installs, or store installs whose index entry is gone
  // or not loaded yet). The source is part of the key so both variants of
  // the same repo/name never share a cache entry.
  const fromDisk = shown != null && shown.path == null;
  const {
    data: detail,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "skill-detail",
      fromDisk ? "local" : "remote",
      shown?.repo,
      shown?.name,
    ],
    queryFn: () =>
      fromDisk
        ? fetchLocalSkillDetail(shown!.name)
        : fetchSkillDetail(shown!.repo, shown!.name, shown!.path),
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

  // Always render the DrawerContent — Radix mounts and unmounts it with the
  // Drawer's open state, keeping the drawer alive through the close
  // animation. With no skill (and no latch yet) the drawer is empty, which
  // only happens before the first selection.
  const owner = shown?.repo.split("/")[0] ?? "";
  // No repo at all → a skill placed manually into the global directory:
  // nothing to link to, and the stats it cannot have stay hidden (the same
  // Puzzle placeholder the my-skills row uses).
  const isLocalSkill = shown != null && !shown.repo;
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
  // Version identity as the registry sees it: the directory fingerprint, and
  // how long the index has carried that exact content. From the index entry,
  // not the SKILL.md — so absent on unscanned entries and on local installs
  // the registry never listed.
  const rev = shown?.rev ? formatRev(shown.rev) : null;
  const seenAt = formatDate(shown?.firstSeenAt);

  return (
    <DrawerContent>
      <DrawerHeader>
        {isLocalSkill ? (
          <div
            aria-label="skill 头像"
            className="flex h-11 w-11 items-center justify-center self-start rounded-lg border border-border/60 bg-muted text-muted-foreground"
          >
            <Puzzle className="h-5 w-5" />
          </div>
        ) : (
          <OwnerAvatar owner={owner} className="h-11 w-11 text-[18px]" />
        )}
        <DrawerTitle className="truncate">{shown?.name}</DrawerTitle>
        {isLocalSkill ? (
          <DrawerDescription>本地安装</DrawerDescription>
        ) : (
          <DrawerDescription asChild>
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
          </DrawerDescription>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {detail?.license && (
            <Badge variant="secondary">{detail.license}</Badge>
          )}
          {detail?.author && <Badge variant="secondary">{detail.author}</Badge>}
          {!isLocalSkill && (
            <>
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
            </>
          )}
        </div>
        {(rev || seenAt) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/70">
            {rev && (
              <span title={`技能目录的内容指纹（目录内任何文件或其权限变化都会改变）：${shown?.rev}`}>
                版本 <span className="font-mono">{rev}</span>
              </span>
            )}
            {rev && seenAt && (
              <span aria-hidden="true">·</span>
            )}
            {seenAt && (
              <span title="注册表首次收录当前版本内容的时间；内容一变即重新起算">
                收录时间 {seenAt}
              </span>
            )}
          </div>
        )}
      </DrawerHeader>

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
              该技能目录下可能没有可访问的 SKILL.md。
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
              {isLocalSkill ? (
                <p className="mb-2 truncate font-mono text-[11px] text-muted-foreground/70">
                  {detail.path}
                </p>
              ) : (
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
              )}
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
    </DrawerContent>
  );
}
