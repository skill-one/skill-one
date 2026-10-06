import { useState, useId, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, Download, Loader2, Star, Unlink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Checkbox } from "../../components/ui/checkbox";
import { Button } from "../../components/ui/button";
import { OwnerAvatar } from "../../components/owner-avatar";
import { formatCount } from "../../lib/utils";
import type { LinkCandidate } from "../../lib/link-suggestions";
import type { LinkableSkill } from "./source-link-banner";

export interface BatchSelectionItem {
  name: string;
  repo: string;
  defaultTags?: readonly string[];
}

export function SourceLinkBatchDialog({
  open,
  onOpenChange,
  skills,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: readonly LinkableSkill[];
  onConfirm: (selections: readonly BatchSelectionItem[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const selectAllId = useId();
  const [busy, setBusy] = useState(false);

  // Track which skills are checked for linking (default: all)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(
    () => new Set(skills.map((s) => s.name)),
  );

  // Track the picked candidate per skill (default: top recommended)
  const [chosenCandidates, setChosenCandidates] = useState<
    Record<string, LinkCandidate>
  >(() => {
    const initial: Record<string, LinkCandidate> = {};
    for (const item of skills) {
      initial[item.name] = item.recommendedCandidate;
    }
    return initial;
  });

  // Re-sync default selections when opened or when skills change
  useEffect(() => {
    if (open) {
      setSelectedNames(new Set(skills.map((s) => s.name)));
      const initial: Record<string, LinkCandidate> = {};
      for (const item of skills) {
        initial[item.name] = item.recommendedCandidate;
      }
      setChosenCandidates(initial);
    }
  }, [open, skills]);

  // Sync state if skills list changes
  const validSkills = skills.filter((s) => s.candidates.length > 0);

  const toggleSelect = (name: string, checked: boolean) => {
    const next = new Set(selectedNames);
    if (checked) next.add(name);
    else next.delete(name);
    setSelectedNames(next);
  };

  const allSelected =
    validSkills.length > 0 &&
    validSkills.every((s) => selectedNames.has(s.name));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedNames(new Set(validSkills.map((s) => s.name)));
    } else {
      setSelectedNames(new Set());
    }
  };

  const handlePickCandidate = (name: string, candidate: LinkCandidate) => {
    setChosenCandidates((prev) => ({ ...prev, [name]: candidate }));
  };

  const handleConfirm = async () => {
    const items: BatchSelectionItem[] = [];
    for (const skill of validSkills) {
      if (selectedNames.has(skill.name)) {
        const candidate = chosenCandidates[skill.name] ?? skill.recommendedCandidate;
        items.push({
          name: skill.name,
          repo: candidate.skill.repo,
          defaultTags: candidate.skill.profile?.domain,
        });
      }
    }
    if (items.length === 0) return;

    setBusy(true);
    try {
      await onConfirm(items);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = validSkills.filter((s) => selectedNames.has(s.name)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("sourceLink.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("sourceLink.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Select all toolbar row */}
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <label
            htmlFor={selectAllId}
            className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground"
          >
            <Checkbox
              id={selectAllId}
              checked={allSelected}
              onCheckedChange={(checked) => toggleSelectAll(!!checked)}
            />
            <span>
              {t("sourceLink.dialogSelectAll")} ({selectedCount}/{validSkills.length})
            </span>
          </label>
        </div>

        {/* Candidates review list */}
        <div className="max-h-[380px] overflow-y-auto space-y-2 py-1 pr-1">
          {validSkills.map((item) => {
            const isChecked = selectedNames.has(item.name);
            const currentCandidate =
              chosenCandidates[item.name] ?? item.recommendedCandidate;
            const isRecommended =
              currentCandidate.skill.repo === item.recommendedCandidate.skill.repo;

            return (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/60 p-2.5 transition-colors hover:bg-card"
              >
                {/* Left: Checkbox + Name + Local Description */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => toggleSelect(item.name, !!checked)}
                    aria-label={item.name}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-foreground truncate">
                      {item.name}
                    </p>
                    {item.localDescription ? (
                      <p className="text-[11px] text-muted-foreground truncate" title={item.localDescription}>
                        {item.localDescription}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Arrow indicator */}
                <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0" aria-hidden />

                {/* Right: Target candidate repo (fixed width keeps arrows aligned) */}
                <div className="w-60 shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          title={t("sourceLink.dialogChangeCandidate")}
                          className="inline-flex w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                        />
                      }
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        {currentCandidate.skill.repo ? (
                          <>
                            <OwnerAvatar
                              owner={currentCandidate.skill.repo.split("/")[0]}
                              className="size-3.5 shrink-0 text-[8px]"
                            />
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground text-[11px]">
                              {currentCandidate.skill.repo}
                            </span>
                            {isRecommended && (
                              <span className="shrink-0 rounded bg-primary/10 px-1 py-0.2 text-[9px] text-primary border border-primary/20">
                                {t("sourceLink.recommendedBadge")}
                              </span>
                            )}
                            {currentCandidate.skill.stars > 0 ? (
                              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
                                <Star className="size-2 text-amber-500 fill-amber-500/30" />
                                {formatCount(currentCandidate.skill.stars)}
                              </span>
                            ) : currentCandidate.skill.downloads > 0 ? (
                              <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
                                <Download className="size-2 text-muted-foreground" />
                                {formatCount(currentCandidate.skill.downloads)}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Unlink className="size-3 text-muted-foreground/80" />
                            <span>{t("sourceLink.dialogKeepUnlinkedShort")}</span>
                          </div>
                        )}
                      </div>
                      <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[300px]">
                      {item.candidates.map((c) => {
                        const isTop = c.skill.repo === item.recommendedCandidate.skill.repo;
                        return (
                          <DropdownMenuItem
                            key={c.skill.repo}
                            onClick={() => handlePickCandidate(item.name, c)}
                            className="flex items-center justify-between gap-2 text-xs cursor-pointer py-1.5"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <OwnerAvatar
                                owner={c.skill.repo.split("/")[0]}
                                className="size-3.5 text-[8px]"
                              />
                              <span className="truncate font-medium text-[11px]">
                                {c.skill.repo}
                              </span>
                              {isTop && (
                                <span className="rounded bg-primary/10 px-1 py-0.2 text-[8px] text-primary">
                                  {t("sourceLink.recommendedBadge")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                              {c.skill.stars > 0 ? (
                                <span>★ {formatCount(c.skill.stars)}</span>
                              ) : c.skill.downloads > 0 ? (
                                <span>↓ {formatCount(c.skill.downloads)}</span>
                              ) : null}
                              <span>{c.similarity > 0 ? `${Math.round(c.similarity * 100)}%` : "skills.sh"}</span>
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          handlePickCandidate(item.name, {
                            similarity: 0,
                            skill: {
                              name: item.name,
                              repo: "",
                              description: "",
                              stars: 0,
                              downloads: 0,
                            },
                          })
                        }
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer py-1.5"
                      >
                        <Unlink className="size-3.5 text-muted-foreground" />
                        <span className="text-[11px]">{t("sourceLink.dialogKeepUnlinked")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between pt-2">
          <span className="text-[11px] text-muted-foreground">
            {t("sourceLink.footnote")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={selectedCount === 0 || busy}
              onClick={handleConfirm}
              className="cursor-pointer gap-1"
            >
              {busy && <Loader2 className="size-3 animate-spin" />}
              <span>
                {selectedCount > 0
                  ? t("sourceLink.dialogConfirmAction", { count: selectedCount })
                  : t("sourceLink.dialogNoSelection")}
              </span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
