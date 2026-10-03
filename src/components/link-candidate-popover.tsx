import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { LinkCandidateList } from "./link-candidate-list";
import type { LinkCandidate } from "../lib/link-suggestions";

/**
 * The body both link surfaces show when they offer a skill's source: the
 * unlinked list row (via the suggestion badge) and the detail drawer's
 * change-source popover. They ask the same question — "which repo is this?" —
 * and answer it the same way: the local description as the baseline to compare
 * against, the ranked namesakes, and the note that linking records a source and
 * moves no local files.
 *
 * Only the framing differs, so only the framing is a prop. The drawer's popover
 * pins the source currently on record above the list and puts the way out below
 * the footnote; the badge has neither, and shows the local description because
 * its candidates come from a ranking the user has not seen yet.
 */
export function LinkCandidatePopover({
  name,
  localDescription,
  candidates,
  cutRepos,
  emptyLabel,
  pendingRepo,
  onPick,
  beforeList,
  afterList,
}: {
  /** The skill whose source is being chosen — names the popup. */
  name: string;
  /**
   * The local skill's own description, shown for comparison. Omitted where
   * there is nothing to compare against (the drawer's popover reads the source
   * off the record instead).
   */
  localDescription?: string;
  /** The ranked namesakes, or `null` while the lookup is still in flight. */
  candidates: LinkCandidate[] | null;
  /**
   * Repos this skill's user has cut, marked in the list rather than hidden
   * from it — see `LinkCandidateList`.
   */
  cutRepos?: readonly string[];
  /** What to say when the lookup answered that no other namesake exists. */
  emptyLabel: string;
  /** The repo whose write is in flight — that row shows a spinner. */
  pendingRepo: string | null;
  onPick: (repo: string) => void;
  /** Rendered between the header and the list (the current source). */
  beforeList?: ReactNode;
  /** Rendered after the footnote (the way out of the association). */
  afterList?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-medium">{t("sourceLink.title")}</p>
        <p className="text-[11px] text-muted-foreground">
          {t("sourceLink.subtitle", { name })}
        </p>
      </div>

      {/* The local description is the fact candidates compare against. */}
      {localDescription?.trim() ? (
        <div className="rounded-md bg-muted/60 px-2 py-1.5">
          <p className="pb-0.5 text-[10px] font-medium text-muted-foreground">
            {t("sourceLink.localLabel")}
          </p>
          <p className="line-clamp-2 text-[11px] leading-snug text-foreground/90">
            {localDescription}
          </p>
        </div>
      ) : null}

      {beforeList}

      {candidates === null ? (
        <div className="flex items-center justify-center py-3 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : candidates.length > 0 ? (
        <LinkCandidateList
          candidates={candidates}
          cutRepos={cutRepos}
          pendingRepo={pendingRepo}
          onPick={(candidate) => onPick(candidate.skill.repo)}
        />
      ) : (
        <p className="px-2 text-[11px] text-muted-foreground">{emptyLabel}</p>
      )}

      <p className="text-[10px] text-muted-foreground">{t("sourceLink.footnote")}</p>

      {afterList}
    </>
  );
}
