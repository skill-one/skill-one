import { Suspense, lazy, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Puzzle,
  Star,
} from "lucide-react";

import { fetchSkillDetail, MIRROR } from "../../lib/skill-detail-api";
import { fetchLocalSkillDetail } from "../../lib/local-skills";
import { githubBlobUrl } from "../../lib/cdn-config";
import { openExternal } from "../../lib/open-external";
import { errorMessage, formatDate, formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { DomainBadge } from "../domain-badge";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
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

/**
 * The header's single provenance affordance: a quiet "源" link for registry
 * skills (opens the mirror SKILL.md) or a "本地文件" label for local ones.
 * The version hash, first-seen date and exact file path are provenance
 * detail, so one hover reveals them in the tooltip instead of taking three
 * permanent header rows.
 */
function ProvenanceTip({
  href,
  rev,
  seenAt,
  path,
}: {
  /** When present the trigger is a link that opens the mirror SKILL.md. */
  href?: string;
  /** Full content hash, as the scraper indexed it. */
  rev?: string;
  /** Formatted date the mirror first fetched this version. */
  seenAt?: string;
  path?: string;
}) {
  const className =
    "flex items-center gap-1 whitespace-nowrap text-muted-foreground/70 transition-colors hover:text-foreground";
  const body = (
    <TooltipContent className="max-w-[260px] text-left normal-case">
      <div className="flex flex-col gap-1">
        {rev && (
          <p>
            <span className="text-background/55">版本 </span>
            <span className="font-mono break-all">{rev}</span>
          </p>
        )}
        {seenAt && (
          <p>
            <span className="text-background/55">收录时间 </span>
            {seenAt}
          </p>
        )}
        {path && <p className="font-mono break-all">{path}</p>}
      </div>
    </TooltipContent>
  );
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? (
            <a
              href={href}
              title="查看版本与来源信息"
              onClick={(e) => {
                e.preventDefault();
                void openExternal(href);
              }}
              className={className}
            >
              源
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span title="查看来源信息" className={className}>
              本地文件
            </span>
          )}
        </TooltipTrigger>
        {body}
      </Tooltip>
    </TooltipProvider>
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
 * Provenance — the content hash, the date the scraper first fetched it and
 * the exact SKILL.md path — comes from the index entry rather than the
 * SKILL.md body, and hides behind the header's 源 tooltip so it costs no
 * permanent rows; unhashed entries and local installs simply show less.
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
  // Profiled registry skills get the 概述 tab (the dataset's per-skill
  // files resolve through the mirror path); local installs and skills the
  // dataset has not profiled keep the plain SKILL.md body.
  const hasProfile = shown?.profile != null && shown.path != null;
  const description = detail?.description || shown?.description;
  // The mirror-relative SKILL.md path, reused for the mirror's GitHub file
  // link and to resolve relative URLs inside the markdown body.
  const filePath = detail?.path.replace(/^\/+|\/+$/g, "") ?? "";
  // The upstream repo the skill ships in; without a known path inside it,
  // the link lands on the repo root.
  const sourceHref =
    !shown || !shown.repo ? "" : `https://github.com/${shown.repo}`;
  // The skill's page on skills.sh, when the index carries one — the deepest
  // upstream link that survives without the repo-internal path.
  const skillsShHref = shown?.url ?? "";
  // The link's href and its open-externally handler point at the same place.
  const skillBlobUrl = githubBlobUrl(MIRROR.repo, filePath, MIRROR.ref);
  // Version identity as the scraper sees it: the full content hash, and the
  // date the mirror first fetched that exact content. Provenance detail —
  // surfaced on hover via the header's 源 tip, not as permanent header rows.
  const rev = shown?.rev ?? null;
  const seenAt = shown?.firstSeenAt ? formatDate(shown.firstSeenAt) : null;

  return (
    <DrawerContent>
      <DrawerHeader className="gap-2 px-6 pt-5">
        <div className="flex items-start gap-3">
          {isLocalSkill ? (
            <div
              aria-label="skill 头像"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground"
            >
              <Puzzle className="h-5 w-5" />
            </div>
          ) : (
            <OwnerAvatar owner={owner} className="h-12 w-12 shrink-0 text-xl" />
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
                  className="inline-flex min-w-0 items-center gap-1"
                >
                  <span className="truncate">{shown?.repo}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </DrawerDescription>
            )}
          </div>
          {/* The primary action lives in the header, like every store's
              detail view: labeled, and visible while the content scrolls. */}
          {!isLocalSkill && (
            <SkillInstallButton
              skill={shown!}
              labeled
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
        {/* One meta row, in priority order: license/author, usage stats,
            external links, provenance, and the profile chip. Everything
            provenance-shaped (hash, date, file path) hides behind 源. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
          {detail?.license && (
            <Badge variant="secondary">{detail.license}</Badge>
          )}
          {detail?.author && <Badge variant="secondary">{detail.author}</Badge>}
          {!isLocalSkill && (
            <>
              <span className="flex items-center gap-1">
                <Download className="h-3.5 w-3.5" />
                <span className="font-medium tabular-nums">
                  {formatCount(shown?.downloads ?? 0)}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="font-medium tabular-nums">
                  {formatCount(shown?.stars ?? 0)}
                </span>
              </span>
              {skillsShHref && (
                <a
                  href={skillsShHref}
                  aria-label="在 skills.sh 中打开"
                  onClick={(e) => {
                    e.preventDefault();
                    void openExternal(skillsShHref);
                  }}
                  className="flex items-center text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <Globe className="h-3.5 w-3.5" />
                </a>
              )}
              {(rev || seenAt || detail) && (
                <ProvenanceTip
                  href={detail ? skillBlobUrl : undefined}
                  rev={rev ?? undefined}
                  seenAt={seenAt ?? undefined}
                  path={detail?.path}
                />
              )}
            </>
          )}
          {isLocalSkill && detail && <ProvenanceTip path={detail.path} />}
          {shown?.profile && (
            <span className="flex items-center gap-1.5">
              <DomainBadge
                domain={shown.profile.domain}
                reason={shown.profile.reason}
              />
              {shown.profile.persona?.role && (
                <span title="skills-profiles 为该技能生成的职业画像">
                  {shown.profile.persona.role}
                </span>
              )}
            </span>
          )}
        </div>
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
            // A profiled skill: the generated overview and SKILL.md live in
            // separate tabs. 概述 is the default — its structured pitch,
            // I/O and notes answer "what is this and is it worth it" faster
            // than the raw (sometimes one-line) SKILL.md, which stays one
            // click away as the canonical source. The tab bar is a
            // GitHub-style underlined row that sticks below the header while
            // long content scrolls underneath it.
            <Tabs defaultValue="overview" className="flex flex-col gap-4">
              <TabsList
                variant="line"
                className="sticky top-0 z-10 h-8 w-full justify-start rounded-none border-b bg-background"
              >
                <TabsTrigger value="overview" className="flex-none text-[13px]">
                  概述
                </TabsTrigger>
                <TabsTrigger value="skill-md" className="flex-none text-[13px]">
                  SKILL.md
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <SkillProfileView
                  skillId={shown!.name}
                  knownPath={shown!.path}
                  scene={shown!.profile?.persona?.scene}
                  tool={shown!.profile?.persona?.tool}
                />
              </TabsContent>
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
            </Tabs>
          ) : (
            <div className="pt-3">
              {detail.instructions ? (
                <Suspense fallback={<MarkdownSkeleton />}>
                  <LazyMarkdown
                    repo={isLocalSkill ? (shown?.repo ?? "") : MIRROR.repo}
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
