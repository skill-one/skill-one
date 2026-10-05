import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Unlink } from "lucide-react";

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
import { errorMessage } from "../../lib/utils";
import type { SkillView } from "../../lib/skill-view";

/**
 * The linked skill's re-selection affordance in the detail drawer: an explicit
 * control beside the source line offering changing the namesake store entry
 * or cutting the association directly. Nothing is written until the user
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

  const pick = async (repo: string, defaultTags?: readonly string[]) => {
    if (await confirm(repo, defaultTags)) setOpen(false);
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
    <div className="inline-flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="xs"
              aria-label={t("detail.changeSourceAria", { name: skill.name })}
              title={t("detail.changeSource")}
              className="h-5 gap-0.5 px-1.5 text-[11px] font-normal text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <span>{t("detail.changeSourceShort")}</span>
              <ChevronDown className="size-3" aria-hidden />
            </Button>
          }
        />
        <PopoverContent align="start" sideOffset={6} className="w-[340px] gap-2.5 p-3">
          <LinkCandidatePopover
            name={skill.name}
            candidates={candidatesPending ? null : (candidates ?? [])}
            emptyLabel={t("detail.noOtherSources")}
            pendingRepo={pendingRepo}
            onPick={(repo, defaultTags) => void pick(repo, defaultTags)}
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
                className="h-7 justify-start px-2 text-[11px] text-destructive hover:text-destructive cursor-pointer"
                disabled={busy}
                onClick={() => void unlink()}
              >
                <Unlink className="size-3 mr-1" aria-hidden />
                {t("detail.unlinkSource")}
              </Button>
            }
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-label={t("detail.unlinkSourceAria", { name: skill.name })}
        className="h-5 gap-1 px-1.5 text-[11px] font-normal text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 cursor-pointer"
        disabled={busy}
        onClick={() => void unlink()}
        title={t("detail.unlinkSource")}
      >
        <Unlink className="size-3" aria-hidden />
        <span>{t("detail.unlinkSource")}</span>
      </Button>
    </div>
  );
}
