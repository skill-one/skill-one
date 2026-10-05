import { useTranslation } from "react-i18next";
import { Link2, Terminal } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "../lib/utils";

/**
 * Geometric shell matching `OwnerAvatar`'s round box and hairline border.
 */
export const THIRD_PARTY_MARK_CLASS =
  "relative flex shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500/80";

/** The same box in the closed tone: a source-less skill with no candidate to link. */
export const THIRD_PARTY_MARK_MUTED_CLASS =
  "relative flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-muted-foreground";

/**
 * Extracts the first meaningful grapheme (letter, Chinese character, or emoji)
 * for a skill's monogram, uppercasing Latin letters.
 */
export function skillInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "S";
  try {
    for (const segment of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)) {
      const first = segment.segment;
      return /[a-z]/i.test(first) ? first.toUpperCase() : first;
    }
  } catch {
    const first = Array.from(trimmed)[0];
    if (first !== undefined) return /[a-z]/i.test(first) ? first.toUpperCase() : first;
  }
  return "S";
}

/**
 * Terminal glyph representing local / third-party capability.
 */
export function ThirdPartyMarkGlyph({ className }: { className?: string }) {
  return <Terminal className={cn("size-[72%]", className)} aria-hidden="true" />;
}

/** Check if class name represents a micro-sized element (< 24px) where badges would collide. */
export function isMicroSize(className?: string): boolean {
  if (!className) return false;
  return /\b(size-[1-5]|w-[1-5]|h-[1-5])\b/.test(className);
}

/**
 * Dual-layer avatar for third-party / local skills (Option 4):
 * - Center: Monogram letter extracted from the skill's name (or Terminal glyph if no name).
 * - Bottom-Right Badge: Local Terminal badge (or amber Link2 badge when linkable).
 */
export function ThirdPartyMark({
  name,
  className,
  muted = false,
  candidate = false,
  showBadge = true,
}: {
  /** The skill's name (e.g. "git-commit"), used to derive the monogram. */
  name?: string;
  className?: string;
  /** The closed tone: nothing to link, so the mark files under neutral. */
  muted?: boolean;
  /** Whether namesake candidates exist to link (shows amber link indicator). */
  candidate?: boolean;
  /** Whether to render the bottom-right badge when size permits. */
  showBadge?: boolean;
}) {
  const { t } = useTranslation();
  const compact = isMicroSize(className);
  const initial = name ? skillInitial(name) : null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={t("common.thirdPartyInstall")}
            className={cn(
              candidate || !muted ? THIRD_PARTY_MARK_CLASS : THIRD_PARTY_MARK_MUTED_CLASS,
              className,
            )}
          >
            {initial && !compact ? (
              <>
                <span className="font-semibold uppercase select-none leading-none text-inherit">
                  {initial}
                </span>
                {showBadge && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 flex size-[40%] items-center justify-center rounded-full ring-1 ring-background shadow-xs",
                      candidate
                        ? "bg-amber-500 text-amber-950 dark:text-amber-100"
                        : "bg-background border border-border/80 text-muted-foreground",
                    )}
                  >
                    {candidate ? (
                      <Link2 className="size-[65%]" />
                    ) : (
                      <Terminal className="size-[65%]" />
                    )}
                  </span>
                )}
              </>
            ) : (
              <ThirdPartyMarkGlyph />
            )}
          </span>
        }
      />
      <TooltipContent>
        {candidate
          ? t("sourceLink.tooltip")
          : t("common.thirdPartyInstallTip")}
      </TooltipContent>
    </Tooltip>
  );
}
