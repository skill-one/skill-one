import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { toast } from "../ui/toast";
import { LinkCandidatePopover } from "../link-candidate-popover";
import {
  findLinkCandidates,
  unlinkSkillSource,
} from "../../lib/link-suggestions";
import { useConfirmSkillSource } from "../../hooks/use-confirm-skill-source";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import { errorMessage, cn } from "../../lib/utils";
import type { SkillView } from "../../lib/skill-view";

/**
 * The linked skill's re-selection affordance in the detail drawer: a quiet
 * chevron beside the source line opens a popover with the source that is
 * currently on record, the other same-name store entries (the same namesake
 * lookup the installed list's suggestions run, minus the current repo), and
 * the way out — cutting the association, which dismisses the repo so the
 * auto-link tiers never chain it back. Nothing is written until the user
 * picks or unlinks; local files never move.
 */
export function SourceLinkMenu({ skill }: { skill: SkillView }) {
  const [open, setOpen] = useState(false);
  // Cutting is its own write, so it carries its own flag rather than borrowing
  // the pick's: the two never overlap, and the button has to read as busy while
  // the ledger is being rewritten under it.
  const [unlinking, setUnlinking] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { pendingRepo, confirm } = useConfirmSkillSource(skill.name);
  const busy = pendingRepo != null || unlinking;

  // Candidates are the popover's own lookup, fetched when it opens and keyed
  // by the current repo so a re-link refetches with the new exclusion. The
  // shared suggestion pool cannot serve this: it only covers unlinked skills.
  const { data: candidates, isPending: candidatesPending } = useQuery({
    queryKey: ["link-candidates", skill.name, skill.repo],
    queryFn: () =>
      findLinkCandidates(skill.name, skill.description, {
        excludeRepo: skill.repo,
      }),
    enabled: open,
  });

  const pick = async (repo: string) => {
    if (await confirm(repo)) setOpen(false);
  };

  const unlink = async () => {
    setUnlinking(true);
    try {
      await unlinkSkillSource(skill.name, skill.repo);
      await markSkillsChanged(queryClient);
      toast.add({ title: t("detail.sourceUnlinked"), type: "success" });
      setOpen(false);
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("sourceLink.failed")),
        type: "error",
      });
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("detail.changeSourceAria", { name: skill.name })}
            title={t("detail.changeSource")}
            className={cn(
              "inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded",
              "text-muted-foreground/70 transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            <ChevronDown className="size-3" aria-hidden />
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-80 gap-2 p-3">
        <LinkCandidatePopover
          name={skill.name}
          candidates={candidatesPending ? null : (candidates ?? [])}
          emptyLabel={t("detail.noOtherSources")}
          pendingRepo={pendingRepo}
          onPick={(repo) => void pick(repo)}
          beforeList={
            /* The source currently on record — pinned and marked, so a
               re-selection always reads against it. */
            <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1.5">
              <Check className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                {skill.repo}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t("detail.currentSource")}
              </span>
            </div>
          }
          afterList={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 justify-start px-2 text-[11px] text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => void unlink()}
            >
              {t("detail.unlinkSource")}
            </Button>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
