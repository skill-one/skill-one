import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { toast } from "../../components/ui/toast";
import { LinkCandidateList } from "../../components/link-candidate-list";

import { recordSkillProvenance } from "../../lib/provenance";
import { markSkillsChanged } from "../../hooks/use-installed-skills";
import { cn, errorMessage } from "../../lib/utils";
import type { LinkCandidate } from "../../lib/link-suggestions";

/**
 * How the entry point presents:
 * - `"label"` — the 本地安装 text and the alert icon are one trigger; the
 *   text underlines on hover so the affordance reads as an action.
 * - `"icon"` — a single muted alert icon (rows nested in a card whose bar
 *   already names the source).
 */
export type LinkSuggestionVariant = "label" | "icon";

/**
 * The weak affordance on an unlinked skill. Hover shows a one-line tooltip
 * (what linking means); click opens a popover with the same-slug registry
 * entries. Each candidate exposes its repo, description and stars so the user
 * can compare it against the local skill — nothing is written until one is
 * picked, and local files never move.
 */
export function LinkSuggestionBadge({
  name,
  localDescription,
  candidates,
  variant = "label",
}: {
  name: string;
  /** The local skill's own description, shown for comparison. */
  localDescription?: string;
  candidates: LinkCandidate[];
  variant?: LinkSuggestionVariant;
}) {
  const [open, setOpen] = useState(false);
  const [pendingRepo, setPendingRepo] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const pick = async (candidate: LinkCandidate) => {
    setPendingRepo(candidate.skill.repo);
    try {
      // A confirmed pick is recorded into the ledger like a native install;
      // the user's choice is the act of identification.
      await recordSkillProvenance(candidate.skill.repo, name, "confirm");
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

  // No candidate to link: the label variant stays a plain source statement,
  // the icon variant renders nothing at all.
  if (candidates.length === 0) {
    return variant === "label" ? (
      <span className="truncate">{t("common.localInstall")}</span>
    ) : null;
  }

  const trigger =
    variant === "label" ? (
      <button
        type="button"
        aria-label={t("migration.triggerAria", { name })}
        // The card/row body behind the trigger opens the detail drawer;
        // opening the popover or picking must not do that.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "group inline-flex min-w-0 shrink-0 cursor-pointer items-center gap-1",
          "text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <span className="truncate underline-offset-2 group-hover:underline">
          {t("common.localInstall")}
        </span>
        <TriangleAlert
          className="size-3 shrink-0 text-amber-500/60 transition-colors group-hover:text-amber-500"
          aria-hidden
        />
      </button>
    ) : (
      <button
        type="button"
        aria-label={t("migration.triggerAria", { name })}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex size-4 shrink-0 cursor-pointer items-center justify-center",
          "text-amber-500/60 transition-colors hover:text-amber-500",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <TriangleAlert className="size-3" aria-hidden />
      </button>
    );

  return (
    // Linear trigger composition: PopoverTrigger and TooltipTrigger each
    // merge their props onto the next element, so both end up on the button
    // (a Root component as a merged child swallows the props).
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<TooltipTrigger render={trigger} />} />
        <PopoverContent
          align="start"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="w-80 gap-2 p-3"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium">{t("migration.badge")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("migration.subtitle", { name })}
            </p>
          </div>

          {/* The local description is the fact candidates compare against. */}
          {localDescription?.trim() ? (
            <div className="rounded-md bg-muted/60 px-2 py-1.5">
              <p className="pb-0.5 text-[10px] font-medium text-muted-foreground">
                {t("migration.localLabel")}
              </p>
              <p className="line-clamp-2 text-[11px] leading-snug text-foreground/90">
                {localDescription}
              </p>
            </div>
          ) : null}

          <LinkCandidateList
            candidates={candidates}
            pendingRepo={pendingRepo}
            onPick={(candidate) => void pick(candidate)}
          />

          <p className="text-[10px] text-muted-foreground">
            {t("migration.footnote")}
          </p>
        </PopoverContent>
      </Popover>
      <TooltipContent>{t("migration.tooltip")}</TooltipContent>
    </Tooltip>
  );
}