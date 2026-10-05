import { useTranslation } from "react-i18next";
import { Download, Loader2, Star } from "lucide-react";

import { useAppLocale } from "../i18n/use-language";
import { skillDescription } from "../lib/i18n-content";
import type { LinkCandidate } from "../lib/link-suggestions";
import { cn, formatCount } from "../lib/utils";
import { OwnerAvatar } from "./owner-avatar";

/**
 * The ranked candidate rows every link surface shares — the installed list's
 * suggestion badge and the detail drawer's change-source popover. Each row
 * exposes its repo, description and stars so the user can compare it against
 * the local skill; writing the pick is the caller's job (`onPick`).
 */
export function LinkCandidateList({
  candidates,
  cutRepos,
  pendingRepo,
  onPick,
}: {
  candidates: LinkCandidate[];
  /**
   * Repos this skill's user has cut. Their rows stay clickable — re-picking
   * one is the user's own act of re-identification — but say so, because the
   * alternative is a repo they explicitly refused presenting as if it were new.
   */
  cutRepos?: readonly string[];
  /** The repo whose write is in flight — that row shows a spinner. */
  pendingRepo: string | null;
  onPick: (candidate: LinkCandidate) => void;
}) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  return (
    <ul className="max-h-72 overflow-y-auto space-y-1">
      {candidates.map(({ skill, similarity }, index) => {
        const pending = pendingRepo === skill.repo;
        const cut = cutRepos?.includes(skill.repo) ?? false;
        const isRecommended = index === 0 && !cut;
        return (
          <li key={skill.repo}>
            <button
              type="button"
              disabled={pendingRepo != null}
              onClick={() => onPick({ skill, similarity })}
              className={cn(
                "group flex w-full flex-col gap-1 rounded-md border border-border/40 bg-card/40 p-2 text-left transition-all",
                "hover:border-border hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                "disabled:cursor-wait disabled:opacity-60",
              )}
            >
              {/* Row 1: Avatar + Repo + [Recommended] + Status/Stars */}
              <div className="flex items-center gap-1.5 min-w-0 w-full">
                <OwnerAvatar
                  owner={skill.repo.split("/")[0]}
                  className="size-4 shrink-0 text-[9px]"
                />
                <span className="min-w-0 truncate text-xs font-medium text-foreground">
                  {skill.repo}
                </span>
                {isRecommended && (
                  <span className="shrink-0 rounded bg-primary/10 px-1 py-0.2 text-[9px] font-medium text-primary border border-primary/20">
                    {t("sourceLink.recommendedBadge")}
                  </span>
                )}
                <div className="ml-auto flex items-center shrink-0">
                  {pending ? (
                    <Loader2
                      className="size-3 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  ) : cut ? (
                    <span
                      className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                      title={t("sourceLink.cutBadge")}
                    >
                      {t("sourceLink.cutBadge")}
                    </span>
                  ) : skill.stars > 0 ? (
                    <span
                      className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-amber-600 dark:text-amber-400"
                      title={t("sourceLink.starsTitle")}
                    >
                      <Star className="size-2.5 fill-amber-500/30 text-amber-500" aria-hidden />
                      {formatCount(skill.stars)}
                    </span>
                  ) : skill.downloads > 0 ? (
                    <span
                      className="inline-flex items-center gap-0.5 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground"
                      title={t("sourceLink.downloadsTitle")}
                    >
                      <Download className="size-2.5" aria-hidden />
                      {formatCount(skill.downloads)}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Row 2: Description + Similarity */}
              <div className="flex items-baseline justify-between gap-2 min-w-0 w-full">
                <span className="line-clamp-1 truncate text-[11px] leading-snug text-muted-foreground group-hover:text-foreground/80">
                  {skillDescription(skill, locale) || t("sourceLink.skillsShResult")}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/75 tabular-nums">
                  {similarity > 0
                    ? t("sourceLink.similarity", {
                        percent: Math.round(similarity * 100),
                      })
                    : t("sourceLink.fromSkillsSh")}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
