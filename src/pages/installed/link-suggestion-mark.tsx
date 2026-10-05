import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder } from "lucide-react";

import { LinkCandidatePopover } from "../../components/link-candidate-popover";
import {
  isMicroSize,
  skillInitial,
  THIRD_PARTY_MARK_CLASS,
  ThirdPartyMark,
  ThirdPartyMarkGlyph,
} from "../../components/third-party-mark";
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
import { useConfirmSkillSource } from "../../hooks/use-confirm-skill-source";
import { cn } from "../../lib/utils";
import type { LinkCandidate } from "../../lib/link-suggestions";

/**
 * The third-party mark as the affordance it always should have been: the
 * source-less skill's own face is also the way to give it one.
 *
 * With namesake candidates in the registry it is a control — pressed, it offers
 * them, and picking one writes the confirmation to the ledger. Each candidate
 * exposes its repo, description and stars so the user can compare it against
 * the local skill; nothing is written until one is picked, and local files
 * never move. Hover deepens the mark's own amber, so the pointer is told what
 * it can press, and the tooltip names what a press does.
 *
 * With no candidate there is nothing to offer, so the mark is a statement
 * again — the plain `ThirdPartyMark`, tooltip and all, in its muted tone: an
 * amber box would keep asking for a press that has nothing behind it, so the
 * closed case files under the owner-face's neutral fill instead.
 *
 * It replaces what used to be two marks: the broken-chain glyph and, beside it,
 * an amber alert triangle. The glyph already says 「装了，但说不出是谁装的」, and a
 * second icon saying so again was one mark too many in a row's facts cluster —
 * and worse, the alert was the only one of the two that did anything, which is
 * the half of it a reader would have to learn to aim at.
 */
export function LinkSuggestionMark({
  name,
  localDescription,
  candidates,
  cutRepos,
  className,
  labeled = false,
}: {
  /** The skill whose source is unknown; also what the trigger is named for. */
  name: string;
  /** The local skill's own description, shown for comparison. */
  localDescription?: string;
  candidates: LinkCandidate[];
  /** Repos this skill's user has cut; their rows are marked, not hidden. */
  cutRepos?: readonly string[];
  /** Sized by the surface that owns the face's slot — a row, a square, a bar. */
  className?: string;
  /** Whether to render a labeled pill button (e.g. in the detail drawer). */
  labeled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { pendingRepo, confirm } = useConfirmSkillSource(name);

  const pick = async (repo: string, defaultTags?: readonly string[]) => {
    if (await confirm(repo, defaultTags)) setOpen(false);
  };

  if (candidates.length === 0) {
    return labeled ? (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <ThirdPartyMark muted name={name} className={className} />
        <span className="truncate">{t("common.thirdPartyInstall")}</span>
      </span>
    ) : (
      <ThirdPartyMark muted name={name} className={className} />
    );
  }

  // The mark, pressed. It is a real button so the keyboard reaches it and the
  // popover's expanded state is announced; the box keeps the owner's geometry
  // and adds only the affordances every other control in the app answers with.
  // Linear trigger composition: PopoverTrigger and TooltipTrigger each merge
  // their props onto the next element, so both end up on the button (a Root
  // component as a merged child swallows the props).
  const trigger = labeled ? (
    <button
      type="button"
      aria-label={t("sourceLink.triggerAria", { name })}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/trigger inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300",
        "cursor-pointer transition-colors hover:bg-amber-500/20 hover:border-amber-500/40",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <span className={cn(THIRD_PARTY_MARK_CLASS, className)}>
        <ThirdPartyMarkGlyph />
      </span>
      <span className="truncate">{t("common.thirdPartyInstall")}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-normal text-amber-600 dark:text-amber-400 underline decoration-amber-500/40 underline-offset-2">
        · {t("sourceLink.linkSuggestionAction")}
      </span>
    </button>
  ) : (
    <button
      type="button"
      aria-label={t("sourceLink.triggerAria", { name })}
      // The card/row body behind the trigger opens the detail drawer;
      // opening the popover or picking must not do that.
      onClick={(e) => e.stopPropagation()}
      className={cn(
        THIRD_PARTY_MARK_CLASS,
        // Pressable, so it answers a pointer the way every control in the app
        // does — but in its own amber, deepening rather than changing hue: a
        // hover that greyed the ink would drop the mark back into the crowd it
        // stands out of.
        "cursor-pointer transition-colors hover:bg-amber-500/20 hover:text-amber-500",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      {isMicroSize(className) ? (
        <ThirdPartyMarkGlyph />
      ) : (
        <>
          <span className="font-semibold uppercase select-none leading-none text-inherit">
            {skillInitial(name)}
          </span>
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex size-[40%] items-center justify-center rounded-full bg-amber-500 text-amber-950 dark:text-amber-100 ring-1 ring-background shadow-xs"
          >
            <Folder className="size-[65%]" />
          </span>
        </>
      )}
    </button>
  );

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<TooltipTrigger render={trigger} />} />
        <PopoverContent
          align="start"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="w-80 gap-2 p-3"
        >
          <LinkCandidatePopover
            name={name}
            localDescription={localDescription}
            candidates={candidates}
            cutRepos={cutRepos}
            emptyLabel={t("detail.noOtherSources")}
            pendingRepo={pendingRepo}
            onPick={(repo, defaultTags) => void pick(repo, defaultTags)}
          />
        </PopoverContent>
      </Popover>
      <TooltipContent>{t("sourceLink.tooltip")}</TooltipContent>
    </Tooltip>
  );
}
