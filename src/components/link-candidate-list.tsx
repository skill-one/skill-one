import { useTranslation } from "react-i18next";
import { Loader2, Star } from "lucide-react";

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
  pendingRepo,
  onPick,
}: {
  candidates: LinkCandidate[];
  /** The repo whose write is in flight — that row shows a spinner. */
  pendingRepo: string | null;
  onPick: (candidate: LinkCandidate) => void;
}) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  return (
    <ul className="max-h-72 overflow-y-auto">
      {candidates.map(({ skill, similarity }) => {
        const pending = pendingRepo === skill.repo;
        return (
          <li key={skill.repo}>
            <button
              type="button"
              disabled={pendingRepo != null}
              onClick={() => onPick({ skill, similarity })}
              className={cn(
                "flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left",
                "transition-colors hover:bg-accent/50",
                "focus-visible:bg-accent/50 focus-visible:outline-none",
                "disabled:cursor-wait disabled:opacity-60",
              )}
            >
              <span className="flex items-center gap-1.5">
                <OwnerAvatar
                  owner={skill.repo.split("/")[0]}
                  className="size-4 text-[9px]"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                  {skill.repo}
                </span>
                {pending ? (
                  <Loader2
                    className="size-3 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : skill.stars > 0 ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground"
                    title={t("migration.starsTitle")}
                  >
                    <Star className="size-2.5" aria-hidden />
                    {formatCount(skill.stars)}
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {skillDescription(skill, locale)}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                {t("migration.similarity", {
                  percent: Math.round(similarity * 100),
                })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
