import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

import { recordSkillProvenance } from "../../lib/provenance";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import { cn, errorMessage } from "../../lib/utils";
import type { LinkCandidate } from "../../lib/link-suggestions";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { OwnerAvatar } from "../../components/owner-avatar";

/**
 * Confirmable association of a tool-installed skill with its store entry.
 *
 * The candidates are same-slug registry entries ranked by description
 * similarity — a heuristic, never proof (forks share wording), so nothing is
 * written until the user picks one. A confirmed pick is recorded into the
 * provenance ledger exactly like a native install: the association is
 * permanent, and the card and detail drawer immediately speak for that repo.
 */
export function LinkSuggestionDialog({
  skillName,
  candidates,
  open,
  onOpenChange,
}: {
  skillName: string;
  candidates: LinkCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pendingRepo, setPendingRepo] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const confirm = async (candidate: LinkCandidate) => {
    setPendingRepo(candidate.skill.repo);
    try {
      // Confirmed associations are indistinguishable from native installs in
      // the ledger — the user's pick is the same act of identification.
      await recordSkillProvenance(candidate.skill.repo, skillName);
      await markSkillsChanged(queryClient);
      toast.success(`已关联到 ${candidate.skill.repo}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, "关联失败"));
    } finally {
      setPendingRepo(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>关联商店条目</DialogTitle>
          <DialogDescription>
            「{skillName}」由其他工具安装，来源未知。以下商店条目同名且描述相似，确认后即建立永久关联。
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {candidates.map(({ skill, similarity }) => (
            <li key={skill.repo}>
              <button
                type="button"
                disabled={pendingRepo != null}
                onClick={() => void confirm({ skill, similarity })}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left",
                  "transition-colors hover:border-border hover:bg-accent/40",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-wait disabled:opacity-60",
                )}
              >
                <OwnerAvatar
                  owner={skill.repo.split("/")[0]}
                  className="h-6 w-6 shrink-0 rounded-md text-[11px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    <span className="truncate">{skill.repo}</span>
                    <ExternalLink
                      className="h-3 w-3 shrink-0 text-muted-foreground/60"
                      aria-hidden
                    />
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {skill.description || "（无描述）"}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                  title="描述相似度（仅供参考，不作为关联依据）"
                >
                  {Math.round(similarity * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The affordance on an unlinked card that opens the dialog: a quiet icon
 * button in the same corner as the enable switch, shown only when the
 * registry offered candidates for this skill.
 */
export function LinkSuggestionButton({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground"
      aria-label={`关联 ${name} 的商店条目`}
      title="关联商店条目"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Link2 />
    </Button>
  );
}
