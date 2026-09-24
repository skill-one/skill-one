import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Store } from "lucide-react";

import { useAppLocale } from "../../i18n/use-language";
import { skillDescription } from "../../lib/i18n-content";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../components/ui/hover-card";
import { toast } from "../../components/ui/toast";

import { recordSkillProvenance } from "../../lib/provenance";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import { cn, errorMessage } from "../../lib/utils";
import type { LinkCandidate } from "../../lib/link-suggestions";
import { OwnerAvatar } from "../../components/owner-avatar";

/**
 * Confirmable migration of a tool-installed skill to its store entry.
 *
 * The candidates are same-slug registry entries ranked by description
 * similarity — a heuristic, never proof (forks share wording), so nothing is
 * written until the user picks one. A confirmed pick is recorded into the
 * provenance ledger exactly like a native install: the migration is
 * permanent (local files never move), and the card and detail drawer
 * immediately speak for that repo.
 */

/**
 * The affordance on an unlinked card: an amber badge next to the 本地安装
 * source label. Hovering (or clicking) floats a guide popover that lists the
 * candidates — clicking one confirms the migration right there, no second
 * dialog. The single, self-sufficient entry point for the whole flow.
 */
export function LinkSuggestionBadge({
  name,
  candidates,
}: {
  name: string;
  candidates: LinkCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [pendingRepo, setPendingRepo] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const locale = useAppLocale();

  const pick = async (candidate: LinkCandidate) => {
    setPendingRepo(candidate.skill.repo);
    try {
      // Confirmed associations are indistinguishable from native installs in
      // the ledger — the user's pick is the same act of identification.
      await recordSkillProvenance(candidate.skill.repo, name);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("migration.migrated", { repo: candidate.skill.repo }),
        type: "success",
      });
      setOpen(false);
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("migration.migrateFailed")),
        type: "error",
      });
    } finally {
      setPendingRepo(null);
    }
  };

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={150}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={t("migration.triggerAria", { name })}
            onClick={(e) => {
              e.stopPropagation();
              // Hover/focus already opens the popover; the click only makes
              // sure it is open (touch, and the keyboard path in tests).
              setOpen(true);
            }}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400",
              "transition-colors hover:bg-amber-500/20",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            <Store className="h-2.5 w-2.5" aria-hidden />
            {t("migration.badge")}
          </button>
        }
      />
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={6}
        // The popover is portaled, but React still bubbles its events up the
        // component tree — through the badge into the card, whose whole body
        // opens the detail drawer. Picking a candidate must not do that.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "z-50 w-72 rounded-lg border bg-background p-2.5 shadow-md",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
        )}
      >
          <p className="px-1.5 pb-1 text-[12px] font-medium">
            {t("migration.title")}
          </p>
          <ul className="max-h-56 overflow-y-auto">
            {candidates.map(({ skill, similarity }) => (
              <li key={skill.repo}>
                <button
                  type="button"
                  title={skillDescription(skill, locale) || undefined}
                  disabled={pendingRepo != null}
                  onClick={() => void pick({ skill, similarity })}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left",
                    "transition-colors hover:bg-accent/40",
                    "focus-visible:bg-accent/40 focus-visible:outline-none",
                    "disabled:cursor-wait disabled:opacity-60",
                  )}
                >
                  <OwnerAvatar
                    owner={skill.repo.split("/")[0]}
                    className="h-5 w-5 text-[10px]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                    {skill.repo}
                  </span>
                  <span
                    className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
                    title={t("migration.similarityTitle")}
                  >
                    {Math.round(similarity * 100)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-1.5 pt-1.5 text-[10px] leading-snug text-muted-foreground">
            {t("migration.hint")}
          </p>
      </HoverCardContent>
    </HoverCard>
  );
}
