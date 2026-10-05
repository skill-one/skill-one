import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "../../components/ui/button";
import type { LinkCandidate } from "../../lib/link-suggestions";

export interface LinkableSkill {
  name: string;
  localDescription?: string;
  candidates: LinkCandidate[];
  recommendedCandidate: LinkCandidate;
}

export function SourceLinkBanner({
  skills,
  onLinkAll,
  onOpenReview,
  onDismiss,
}: {
  skills: readonly LinkableSkill[];
  onLinkAll: () => Promise<void>;
  onOpenReview: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  if (skills.length === 0) return null;

  const namesSummary =
    skills.slice(0, 3).map((s) => s.name).join(", ") +
    (skills.length > 3 ? "..." : "");

  const handleLinkAll = async () => {
    setBusy(true);
    try {
      await onLinkAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="region"
      aria-label={t("sourceLink.bannerTitle", { count: skills.length })}
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs transition-all"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-3.5" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold text-foreground">
            {t("sourceLink.bannerTitle", { count: skills.length })}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {t("sourceLink.bannerSubtitle", { names: namesSummary })}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onOpenReview}
          className="h-6 text-[11px] font-normal text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {t("sourceLink.reviewAction")}
        </Button>
        <Button
          type="button"
          variant="default"
          size="xs"
          disabled={busy}
          onClick={handleLinkAll}
          className="h-6 gap-1 px-2.5 text-[11px] font-medium cursor-pointer"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <Link2 className="size-3" aria-hidden />
          )}
          <span>{t("sourceLink.linkAllAction", { count: skills.length })}</span>
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("sourceLink.dismissBanner")}
          title={t("sourceLink.dismissBanner")}
          className="ml-0.5 inline-flex size-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
