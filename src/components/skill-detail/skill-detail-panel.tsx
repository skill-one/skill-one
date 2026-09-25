import { Suspense, lazy, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  ExternalLink,
  Languages,
  Loader2,
  Pencil,
} from "lucide-react";

import { useAppLocale } from "../../i18n/use-language";

import { fetchSkillDetail } from "../../lib/skill-detail-api";
import { MIRROR } from "../../lib/mirror";
import {
  fetchLocalSkillDetail,
  readLocalSkillRaw,
  saveLocalSkillMd,
} from "../../lib/local-skills";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import { githubBlobUrl } from "../../lib/cdn-config";
import { openExternal } from "../../lib/open-external";
import { skillKey, type SkillView } from "../../lib/skill-view";
import {
  errorMessage,
  formatDate,
  formatRelativeTime,
  formatUnixDate,
} from "../../lib/utils";
import { DomainBadge } from "../domain-badge";
import { SkillInstalls } from "../skill-installs";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverTitle,
} from "../ui/popover";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { toast } from "../ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { OwnerAvatar } from "../owner-avatar";
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

/**
 * The editor is the heaviest thing the drawer can mount, so it rides its own
 * chunk: a reader who only browses never downloads CodeMirror.
 */
const LazySkillEditor = lazy(() =>
  import("./skill-editor").then((m) => ({ default: m.SkillEditor })),
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
  const { t } = useTranslation();
  const className =
    "flex items-center gap-1 whitespace-nowrap text-muted-foreground/70 transition-colors hover:text-foreground";
  const body = (
    <TooltipContent className="max-w-[260px] text-left normal-case">
      <div className="flex flex-col gap-1">
        {rev && (
          <p>
            <span className="text-background/55">{t("detail.versionLabel")}</span>
            <span className="font-mono break-all">{rev}</span>
          </p>
        )}
        {seenAt && (
          <p>
            <span className="text-background/55">{t("detail.seenAtLabel")}</span>
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
                title={t("detail.provenanceTitle")}
                onClick={(e) => {
                  e.preventDefault();
                  void openExternal(href);
                }}
                className={className}
              >
                {t("detail.source")}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span title={t("detail.provenanceTitleLocal")} className={className}>
                {t("detail.localFile")}
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
  const { t } = useTranslation();
  const locale = useAppLocale();
  // Relative on the row — "3天前" answers "recently?" — with the exact date on
  // hover answering "exactly when", so neither rendering has to be both. Both
  // renderings share one guard, so `installedExact` is present whenever
  // `installedOn` is.
  const installedOn = formatRelativeTime(installedAt, locale);
  if (!installedOn) return null;
  const installedExact = formatUnixDate(installedAt, locale);
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
            <span className="text-background/55">{t("detail.installedAtLabel")}</span>
            {installedExact}
          </p>
          <p className="text-background/55">
            {t("detail.installedAtHint")}
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
 * listing opened it. The store's chrome — the install CTA and the install
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

  // Editing is a mode of the panel: the body swaps from rendered markdown to a
  // CodeMirror view of the raw file. Only an installed skill has a writable
  // file, so the mode is offered on the installed surface alone (see `editable`).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const locale = useAppLocale();

  // Leaving the current skill (or closing the drawer) drops any edit session, so
  // the next skill never opens on a stale draft.
  const skillIdentity = shown ? skillKey(shown) : null;
  useEffect(() => {
    setEditing(false);
    setDraft(null);
  }, [skillIdentity]);

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
      // While editing, ←/→ must move the caret, not switch skills.
      if (editing) return;
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skill, onPrev, onNext, editing]);

  // Escape dismisses the sheet, which would silently drop an unsaved draft.
  // While editing it is swallowed in the capture phase, so the explicit 取消
  // button stays the intended way out of the edit mode.
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (editing && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () =>
      window.removeEventListener("keydown", onKeyDownCapture, true);
  }, [editing]);

  // Editing is offered only where a writable file exists: an installed skill.
  // A store row is remote mirror content with nothing to save to.
  const editable = surface === "installed" && shown != null;

  // The raw file (frontmatter included) is read only once editing starts, and
  // kept apart from the display detail — a save must round-trip the file, which
  // the display detail (body only) cannot.
  const { data: raw, isPending: rawPending } = useQuery({
    queryKey: ["skill-md-raw", shown?.name],
    queryFn: () => readLocalSkillRaw(shown!.name),
    enabled: editing && shown != null,
  });

  // Seed the draft from the file the first time its text lands.
  useEffect(() => {
    if (editing && raw != null) setDraft(raw);
  }, [editing, raw]);

  // The draft differs from what is on disk — the save button's enablement and
  // the "未保存" hint both hinge on it.
  const dirty = draft != null && raw != null && draft !== raw;

  const handleSave = async () => {
    if (!shown || draft == null || !dirty) return;
    try {
      await saveLocalSkillMd(shown.name, draft);
      // The file changed on disk: refresh the raw cache, the displayed detail
      // and the installed list (whose description is read from the file).
      void queryClient.invalidateQueries({ queryKey: ["skill-md-raw", shown.name] });
      void queryClient.invalidateQueries({ queryKey: ["skill-detail"] });
      await markSkillsChanged(queryClient);
      setEditing(false);
      toast.add({ title: t("detail.saved", { name: shown.name }), type: "success" });
    } catch (err) {
      toast.add({ title: errorMessage(err, t("detail.saveFailed")), type: "error" });
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(null);
  };

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
  // The registry's Chinese description wins for zh; the fetched frontmatter
  // description otherwise keeps its original precedence over the index one.
  // When a translation is what the reader sees, the English original stays
  // one click away behind the header's 查看原文 popover.
  const translated = shown?.descriptionZh?.trim() || "";
  const originalDescription = detail?.description || shown?.description || "";
  const showingTranslation = locale === "zh" && translated !== "";
  const description = showingTranslation
    ? translated
    : originalDescription;
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
  // The link's href and its open-externally handler point at the same place.
  const skillBlobUrl = githubBlobUrl(MIRROR.repo, filePath, MIRROR.ref);
  // Version identity as the scraper sees it: the full content hash, and the
  // date the mirror first fetched that exact content. Provenance detail —
  // surfaced on hover via the header's 源 tip, not as permanent header rows.
  const rev = shown?.rev ?? null;
  const seenAt = shown?.firstSeenAt ? formatDate(shown.firstSeenAt, locale) : null;

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
        {t("detail.noBody")}
      </p>
    )
  ) : null;

  return (
    // The detail body is prose the reader scans, so the default `sm:max-w-sm`
    // sheet is too narrow to hold it. Cap the sheet at the smaller of 48rem
    // and 55% of the window, so it grows with the window and never covers it.
    // The default width rides the `data-[side=right]` variant, whose attribute
    // selector out-specifies a bare `sm:` override — so this one wears the same
    // chain and twMerge drops the default narrow cap.
    <SheetContent className="data-[side=right]:sm:max-w-[min(48rem,55vw)]">
      <SheetHeader className="gap-2 px-6 pt-5">
        <div className="flex items-start gap-3">
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
                    title={t("detail.openSourceRepo")}
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
              <SheetDescription>{t("common.localInstall")}</SheetDescription>
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
            never push the tabs and the body out of the fixed header. When
            zh shows the registry's translation, the English original stays
            one click away behind a quiet 查看-原文 popover. */}
        {description && (
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <ExpandableDescription text={description} />
            </div>
            {showingTranslation && originalDescription && (
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("detail.viewOriginal")}
                      title={t("detail.viewOriginal")}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                    >
                      <Languages />
                    </Button>
                  }
                />
                <PopoverContent align="end" className="w-80">
                  <PopoverTitle>
                    {t("detail.originalDescription")}
                  </PopoverTitle>
                  <p className="max-h-72 overflow-y-auto text-[13px] leading-relaxed text-muted-foreground">
                    {originalDescription}
                  </p>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
        {/* One meta row, in priority order: author, usage stats,
            provenance, and the profile chip. Everything provenance-shaped
            (hash, date, file path) hides behind 源. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted-foreground">
          {detail?.author && <Badge variant="secondary">{detail.author}</Badge>}
          {/* The same install figure the list rows show. Shown for exactly
              the skills whose card shows it — the registry-backed ones — so
              the row the reader clicked and the drawer it opened can never
              disagree about it. */}
          {showStats && shown && <SkillInstalls skill={shown} />}
          {shown && !fromDisk && (rev || seenAt || detail) && (
            <ProvenanceTip
              href={detail ? skillBlobUrl : undefined}
              rev={rev ?? undefined}
              seenAt={seenAt ?? undefined}
              path={detail?.path}
            />
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
      {/* A divider heads the body and carries the file's name: the rule runs the
          full inset width behind a centered SKILL.md label, with the content
          action pinned to its right end. The label and the action sit on the
          popover surface, so they break the line — one divider, not a second
          title bar. */}
      <div className="relative flex min-h-9 items-center justify-end px-6">
        <span
          aria-hidden
          className="absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-border"
        />
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-popover px-3 text-[12px] text-muted-foreground">
          SKILL.md
        </span>
        {editing ? (
          <div className="relative flex items-center gap-1.5 bg-popover pl-3">
            {dirty && (
              <span className="text-[12px] text-muted-foreground">
                {t("detail.unsavedChanges")}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              {t("detail.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!dirty || draft == null || draft.trim() === ""}
              onClick={() => void handleSave()}
            >
              {t("detail.save")}
            </Button>
          </div>
        ) : (
          editable && (
            <div className="relative bg-popover pl-3">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("detail.edit")}
                title={t("detail.editSkill")}
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </Button>
            </div>
          )
        )}
      </div>
      <div className="min-h-0 flex-1">
        {editing ? (
          // Edit mode fills the body with a full-height editor.
          <div className="h-full px-4 pb-4">
            {rawPending || draft == null ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <Suspense fallback={<MarkdownSkeleton />}>
                <LazySkillEditor value={draft} onChange={setDraft} />
              </Suspense>
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-6 pb-6">
            {isPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {t("detail.loadFailed", { message: errorMessage(error) })}
                  <br />
                  {t("detail.loadFailedHint")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => void refetch()}
                >
                  {t("action.retry")}
                </Button>
              </div>
            ) : detail ? (
              <div className="pt-3">{skillMdBody}</div>
            ) : null}
          </div>
        )}
      </div>
    </SheetContent>
  );
}
