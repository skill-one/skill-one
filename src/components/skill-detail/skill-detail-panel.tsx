import { Suspense, lazy, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Puzzle, Star } from "lucide-react";

import { fetchSkillDetail, MIRROR } from "../../lib/skill-detail-api";
import { fetchLocalSkillDetail } from "../../lib/local-skills";
import { githubBlobUrl } from "../../lib/cdn-config";
import { openExternal } from "../../lib/open-external";
import { errorMessage, formatDate, formatCount, formatRev } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { DomainBadge } from "../domain-badge";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "../ui/drawer";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { OwnerAvatar } from "../owner-avatar";
import { SkillInstallButton } from "../skill-install-button";
import { SkillProfileView } from "./skill-profile-view";

/**
 * The markdown body is the heaviest subtree the drawer shows: react-markdown
 * + remark-gfm (plus their unified/mdast stack) only render once a skill's
 * detail has actually loaded, so the whole tree is code-split and pulled in on
 * first open instead of on app boot. The skeleton-loading detail keeps its
 * layout while the chunk arrives.
 */
const LazyMarkdown = lazy(() =>
  import("../markdown").then((m) => ({ default: m.Markdown })),
);

/** Placeholder for the code-split markdown body on the first drawer open. */
function MarkdownSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-5 w-3/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

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
 * skill: a registry-known `path` reads from the skills-sh-mirror mirror
 * snapshot (the same content the registry indexed), while an installed skill
 * without one — local skills included — is read from the local skills
 * directory instead, so the view always shows the copy the user actually
 * installed.
 *
 * The header's version identity (content hash + the date the scraper first
 * fetched it) comes from the index entry rather than the SKILL.md, so
 * unhashed entries and local installs simply show no such row.
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
  // The failure message of the last install attempt (the header CTA),
  // shown under the header.
  const [installError, setInstallError] = useState<string | null>(null);

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
  // Profiled registry skills get the 画像 tab (the dataset's per-skill
  // files resolve through the mirror path); local installs and skills the
  // dataset has not profiled keep the plain SKILL.md body.
  const hasProfile = shown?.profile != null && shown.path != null;
  const description = detail?.description || shown?.description;
  // The mirror-relative SKILL.md path, reused for the mirror's GitHub file
  // link and to resolve relative URLs inside the markdown body.
  const filePath = detail?.path.replace(/^\/+|\/+$/g, "") ?? "";
  // The upstream repo the skill ships in; without a known path inside it,
  // the link lands on the repo root.
  const sourceHref = !shown || !shown.repo ? "" : `https://github.com/${shown.repo}`;
  // The skill's page on skills.sh, when the index carries one — the deepest
  // upstream link that survives without the repo-internal path.
  const skillsShHref = shown?.url ?? "";
  // The link's href and its open-externally handler point at the same place.
  const skillBlobUrl = githubBlobUrl(MIRROR.repo, filePath, MIRROR.ref);
  // Version identity as the scraper sees it: the content hash, and how long
  // the mirror has carried that exact content. From the index entry, not the
  // SKILL.md — so absent on unhashed entries and on local installs the
  // mirror never listed.
  const rev = shown?.rev ? formatRev(shown.rev) : null;
  const seenAt = formatDate(shown?.firstSeenAt);

  return (
    <DrawerContent>
      <DrawerHeader className="gap-1.5 px-6 pt-5">
        <div className="flex items-start gap-3">
          {isLocalSkill ? (
            <div
              aria-label="skill 头像"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground"
            >
              <Puzzle className="h-5 w-5" />
            </div>
          ) : (
            <OwnerAvatar
              owner={owner}
              className="h-12 w-12 shrink-0 text-xl"
            />
          )}
          <div className="min-w-0 flex-1">
            <DrawerTitle className="truncate text-lg font-bold tracking-tight">
              {shown?.name}
            </DrawerTitle>
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
                  title="在 GitHub 中打开源仓库"
                  className="min-w-0 items-center gap-1"
                >
                  <span className="truncate">{shown?.repo}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </DrawerDescription>
            )}
          </div>
          {/* The primary action lives in the header, like every store's
              detail view: it stays visible while the content scrolls. */}
          {!isLocalSkill && (
            <SkillInstallButton
              skill={shown!}
              className="h-8 w-8"
              onError={setInstallError}
            />
          )}
        </div>
        {/* The skill's own summary — shared chrome, visible whichever tab
            is open. Served from the index immediately, refined by the
            fetched SKILL.md frontmatter once it lands. */}
        {description && (
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
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
              {skillsShHref && (
                <a
                  href={skillsShHref}
                  onClick={(e) => {
                    e.preventDefault();
                    void openExternal(skillsShHref);
                  }}
                  title="在 skills.sh 中打开"
                  className="ml-0.5 flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>skills.sh</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
            </>
          )}
        </div>
        {(rev || seenAt) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/70">
            {rev && (
              <span title={`技能文件的内容哈希（上游文件一变即改变）：${shown?.rev}`}>
                版本 <span className="font-mono">{rev}</span>
              </span>
            )}
            {rev && seenAt && (
              <span aria-hidden="true">·</span>
            )}
            {seenAt && (
              <span title="镜像首次抓取当前版本内容的时间；内容一变即重新起算">
                收录时间 {seenAt}
              </span>
            )}
          </div>
        )}
        {shown?.profile && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <DomainBadge
              domain={shown.profile.domain}
              reason={shown.profile.reason}
            />
            {shown.profile.persona?.role && (
              <span
                className="text-[12px] text-muted-foreground"
                title="skills-profiles 为该技能生成的职业画像"
              >
                {shown.profile.persona.role}
              </span>
            )}
          </div>
        )}
        {/* Where this SKILL.md copy lives — metadata too, so it belongs in
            the header rather than pushing the body down inside the tab. */}
        {detail && (
          <div className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground/70">
            {isLocalSkill ? (
              <span className="truncate" title="本地 SKILL.md 路径">
                {detail.path}
              </span>
            ) : (
              <a
                href={skillBlobUrl}
                onClick={(e) => {
                  e.preventDefault();
                  void openExternal(skillBlobUrl);
                }}
                title="在 GitHub 中打开镜像快照里的 SKILL.md"
                className="flex min-w-0 items-center gap-1 transition-colors hover:text-foreground"
              >
                <span className="truncate">{detail.path}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )}
          </div>
        )}
      </DrawerHeader>
      {installError && (
        <p
          role="alert"
          className="mx-6 line-clamp-2 text-[12px] leading-relaxed text-destructive"
        >
          {installError}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              加载失败：
              {errorMessage(error)}
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
          hasProfile ? (
            // A profiled skill: SKILL.md and the generated profile live in
            // separate tabs. SKILL.md stays the default so opening the
            // drawer still lands on the documentation first. The tab bar is
            // a GitHub-style underlined row that sticks below the header
            // while long content scrolls underneath it.
            <Tabs defaultValue="skill-md" className="flex flex-col gap-5">
              <TabsList
                variant="line"
                className="sticky top-0 z-10 w-full justify-start rounded-none border-b bg-background"
              >
                <TabsTrigger value="skill-md">SKILL.md</TabsTrigger>
                <TabsTrigger value="profile">画像</TabsTrigger>
              </TabsList>
              <TabsContent value="skill-md">
                {detail.instructions ? (
                  <Suspense fallback={<MarkdownSkeleton />}>
                    <LazyMarkdown
                      repo={MIRROR.repo}
                      gitRef={MIRROR.ref}
                      filePath={filePath}
                    >
                      {detail.instructions}
                    </LazyMarkdown>
                  </Suspense>
                ) : (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    （SKILL.md 无正文内容）
                  </p>
                )}
              </TabsContent>
              <TabsContent value="profile">
                <SkillProfileView
                  skillId={shown!.name}
                  knownPath={shown!.path}
                  scene={shown!.profile?.persona?.scene}
                  tool={shown!.profile?.persona?.tool}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="pt-2">
              {detail.instructions ? (
                <Suspense fallback={<MarkdownSkeleton />}>
                  <LazyMarkdown
                    repo={isLocalSkill ? shown?.repo ?? "" : MIRROR.repo}
                    gitRef={isLocalSkill ? undefined : MIRROR.ref}
                    filePath={filePath}
                  >
                    {detail.instructions}
                  </LazyMarkdown>
                </Suspense>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  （SKILL.md 无正文内容）
                </p>
              )}
            </div>
          )
        ) : null}
      </div>
    </DrawerContent>
  );
}
