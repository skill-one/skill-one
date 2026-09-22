import { Suspense, lazy, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ExternalLink,
  Globe,
  Loader2,
} from "lucide-react";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { MIRROR } from "../../lib/mirror";
import { fetchLocalSkillDetail } from "../../lib/local-skills";
import { githubBlobUrl } from "../../lib/cdn-config";
import { openExternal } from "../../lib/open-external";
import { LOCAL_SOURCE_LABEL, type SkillView } from "../../lib/skill-view";
import {
  errorMessage,
  formatDate,
  formatRelativeTime,
  formatUnixDate,
} from "../../lib/utils";
import { DomainBadge } from "../domain-badge";
import { SkillPopularity } from "../skill-popularity";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { OwnerAvatar } from "../owner-avatar";
import { SkillCover } from "../skill-cover";
import { SkillEnableSwitch } from "../skill-enable-switch";
import { SkillInstallButton } from "../skill-install-button";
import { SkillRemoveButton } from "../skill-remove-button";
import { ExpandableDescription } from "./expandable-description";

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
      <Tooltip>
        <TooltipTrigger
          render={
            href ? (
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
            )
          }
        />
        {body}
      </Tooltip>
  );
}

/**
 * When a locally installed skill landed on disk — the one fact only an on-disk
 * record carries, reported by `Manager::list` since agents-skills 0.16 and
 * available nowhere else in the app.
 *
 * It lives in the drawer rather than on the card: the card is for *finding* a
 * skill, while this answers a question about the copy the reader actually has.
 * An unrecorded time (some Linux filesystems report none) renders nothing at
 * all, which is also exactly what the store's registry-only rows provide.
 */
function InstalledAt({ installedAt }: { installedAt?: number | null }) {
  // Relative on the row — "3天前" answers "recently?" — with the exact date on
  // hover answering "exactly when". The same split as the popularity figure,
  // and the tooltip already existed, so it costs no new UI element. Both
  // renderings share one guard, so `installedExact` is present whenever
  // `installedOn` is.
  const installedOn = formatRelativeTime(installedAt);
  if (!installedOn) return null;
  const installedExact = formatUnixDate(installedAt);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-slot="installed-at"
            className="flex items-center gap-1 whitespace-nowrap text-muted-foreground/70"
          >
            <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {installedOn}
          </span>
        }
      />
      <TooltipContent className="max-w-[260px] text-left normal-case">
        <div className="flex flex-col gap-1">
          <p>
            <span className="text-background/55">安装于 </span>
            {installedExact}
          </p>
          <p className="text-background/55">
            技能目录的创建时间；从 agent 目录收编的技能保留其原始时间。
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The listing that owns the open drawer. Both surfaces show the same panel fed
 * the same `Skill`; what the surface decides is the chrome only one of them
 * has — the install CTA and the registry-only figures on the store, and the
 * enable switch the store cannot offer. Everything else is read off the skill
 * itself, so a surface never has to describe its own skill twice.
 */
export type SkillDetailSurface = "store" | "installed";

interface SkillDetailPanelProps {
  /** The skill to show; null renders nothing. */
  skill: SkillView | null;
  onPrev: () => void;
  onNext: () => void;
  /** Called after this skill is uninstalled, for a caller that must react. */
  onRemoved?: () => void;
  /** Which listing owns the drawer; defaults to the store. */
  surface?: SkillDetailSurface;
}

/**
 * Detail sheet for one skill, shown as a standard shadcn Sheet sliding
 * in from the right edge of the window. The grid itself never reflows —
 * opening or closing the sheet leaves its layout and scroll position
 * untouched. The sheet is modal (dimmed overlay, focus trap, scroll lock); Escape,
 * clicking the overlay closes it, and ←/→
 * switch skills. Each skill's SKILL.md is fetched through TanStack Query and
 * cached independently, so revisits are instant. The source is picked per
 * skill: a registry-known `path` reads from the skills-profiles snapshot
 * (the same content the registry indexed), while an installed skill
 * without one — local skills included — is read from the local skills
 * directory instead, so the view always shows the copy the user actually
 * installed.
 *
 * Provenance — the content hash, the date the scraper first fetched it and
 * the exact SKILL.md path — comes from the index entry rather than the
 * SKILL.md body, and hides behind the header's 源 tooltip so it costs no
 * permanent rows; unhashed entries and local installs simply show less.
 *
 * `surface` is the only thing the panel cannot read off the skill: which
 * listing opened it. The store's chrome — the install CTA and the popularity
 * figure — is shown there and nowhere else, so the drawer and the card of the
 * listing it was opened from always present the same skill the same way.
 */
export function SkillDetailPanel({
  skill,
  onPrev,
  onNext,
  onRemoved,
  surface = "store",
}: SkillDetailPanelProps) {
  // Keep the last selected skill while the drawer plays its exit
  // animation: `skill` is already null by the time the sheet starts closing,
  // and an unmounting parent would cut the slide-out short.
  const [lastSkill, setLastSkill] = useState<SkillView | null>(skill);
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

  // ←/→ switch skills (delegated to the page); Escape is the sheet's dismiss.
  useEffect(() => {
    if (!skill) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skill, onPrev, onNext]);

  // Always render the SheetContent — Base UI unmounts it with the sheet's
  // open state, keeping it alive through the close animation. With no skill
  // (and no latch yet) the sheet is empty, which only happens before the
  // first selection.

  // No repo at all → a skill whose source the app cannot name (placed into the
  // global directory by hand, or installed by another tool): nothing to link
  // to, and the source line falls back to the local-install label.
  const hasSource = shown != null && shown.repo !== "";
  // The store's install CTA is the one thing the surface itself decides: the
  // installed list installs nothing (its skills are already on disk) and offers
  // the enable switch in that slot instead.
  const isStore = surface === "store";
  // Whether the registry actually backs this skill's figures and classification.
  // The store's rows always are; an installed row only when the app resolved the
  // store entry its recorded source points at — so a record the registry does
  // not know shows no figure rather than a hardcoded zero, the same rule its
  // card follows. An absent marker means backed (see `SkillView`).
  const showStats = shown?.storeBacked !== false;
  const description = detail?.description || shown?.description;
  // The mirror-relative SKILL.md path, reused for the mirror's GitHub file
  // link and to resolve relative URLs inside the markdown body. Only a mirror
  // read has one — a local read's path is absolute and must never be resolved
  // against GitHub — so a disk read renders the body with no base at all.
  const filePath = fromDisk
    ? ""
    : (detail?.path.replace(/^\/+|\/+$/g, "") ?? "");
  // The upstream repo the skill ships in; without a known path inside it,
  // the link lands on the repo root.
  const sourceHref =
    !shown || !shown.repo ? "" : `https://github.com/${shown.repo}`;
  // The owner segment of that repo — the author's face, which the mirror
  // hosts an avatar for and which leads the repo name.
  const [owner] = (shown?.repo ?? "").split("/");
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

  // The canonical SKILL.md body. Registry skills resolve relative links
  // against the snapshot the index was built from; a body read off disk has
  // no repo view to resolve against, so it goes without one.
  const skillMdBody = detail ? (
    detail.instructions ? (
      <Suspense fallback={<MarkdownSkeleton />}>
        <LazyMarkdown
          repo={fromDisk ? "" : MIRROR.repo}
          gitRef={fromDisk ? undefined : MIRROR.ref}
          filePath={filePath}
        >
          {detail.instructions}
        </LazyMarkdown>
      </Suspense>
    ) : (
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        （SKILL.md 无正文内容）
      </p>
    )
  ) : null;

  return (
    <SheetContent>
      <SheetHeader className="gap-2 px-6 pt-5">
        <div className="flex items-start gap-3">
          {/* The same image the row leads with, at the drawer's size: the
              skill's own slot, `SkillCover`'s letter standing in. */}
          <SkillCover
            repo={shown?.repo}
            name={shown?.name}
            className="h-14 w-14 shrink-0 text-2xl"
          />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-lg font-bold tracking-tight">
              {shown?.name}
            </SheetTitle>
            {hasSource ? (
              <SheetDescription
                render={
                  <a
                    href={sourceHref}
                    onClick={(e) => {
                      e.preventDefault();
                      void openExternal(sourceHref);
                    }}
                    title="在 GitHub 中打开源仓库"
                    className="inline-flex min-w-0 items-center gap-1"
                  >
                    {/* The repo's owner avatar leads the repo it belongs to:
                        who published the skill, next to where it lives. */}
                    {owner && (
                      <OwnerAvatar
                        owner={owner}
                        className="h-3.5 w-3.5 text-[8px]"
                      />
                    )}
                    <span className="truncate">{shown?.repo}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                }
              />
            ) : (
              <SheetDescription>{LOCAL_SOURCE_LABEL}</SheetDescription>
            )}
          </div>
          {/* The primary action lives in the header, like every store's
              detail view: labeled, and visible while the content scrolls.
              The installed list installs nothing — its skills are already on
              disk — so it carries its own action instead: the enable switch
              that the store's drawer cannot offer. */}
          {isStore && (
            <SkillInstallButton skill={shown!} labeled />
          )}
          {!isStore && shown && <SkillEnableSwitch skill={shown} />}
          {/* Uninstalling shares that slot, and hides itself unless the skill
              is on disk — so the same drawer serves the store, a repo's list
              and the installed list without any of them passing a flag. */}
          {shown && <SkillRemoveButton skill={shown} onRemoved={onRemoved} />}
        </div>
        {/* The skill's own summary — shared chrome, visible whichever tab
            is open. Served from the index immediately, refined by the
            fetched SKILL.md frontmatter once it lands. Long summaries clamp
            to three lines with an inline 展开, so a verbose description can
            never push the tabs and the body out of the fixed header. */}
        {description && <ExpandableDescription text={description} />}
        {/* One meta row, in priority order: license/author, usage stats,
            external links, provenance, and the profile chip. Everything
            provenance-shaped (hash, date, file path) hides behind 源. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
          {detail?.license && (
            <Badge variant="secondary">{detail.license}</Badge>
          )}
          {detail?.author && <Badge variant="secondary">{detail.author}</Badge>}
          {/* The same blended popularity figure the list rows show;
              hover/focus breaks it into installs and stars. Shown for exactly
              the skills whose card shows it — the registry-backed ones — so
              the row the reader clicked and the drawer it opened can never
              disagree about it. */}
          {showStats && shown && <SkillPopularity skill={shown} />}
          {shown && !fromDisk && (
            <>
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
          {fromDisk && detail && <ProvenanceTip path={detail.path} />}
          {shown?.profile && (
            <DomainBadge domain={shown.profile.domain} />
          )}
          {/* Installed skills only — the on-disk fact the registry cannot
              report. A store row has no local install, so nothing renders. */}
          <InstalledAt installedAt={shown?.installedAt} />
        </div>
      </SheetHeader>
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
          <div className="pt-3">{skillMdBody}</div>
        ) : null}
      </div>
    </SheetContent>
  );
}
