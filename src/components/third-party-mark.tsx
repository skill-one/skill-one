import { useTranslation } from "react-i18next";
import { Folder, Link2 } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "../lib/utils";

/**
 * Geometric shell matching `OwnerAvatar`'s round box and hairline border.
 * Defaults to a clean neutral tone matching shadcn/ui.
 */
export const THIRD_PARTY_MARK_CLASS =
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
 * Folder glyph representing local / third-party filesystem installation.
 */
export function ThirdPartyMarkGlyph({ className }: { className?: string }) {
  return <Folder className={cn("size-[72%]", className)} aria-hidden="true" />;
}

/** Check if class name represents a micro-sized element (< 24px) where badges would collide. */
export function isMicroSize(className?: string): boolean {
  if (!className) return false;
  return /\b(size-[1-5]|w-[1-5]|h-[1-5])\b/.test(className);
}

/**
 * Avatar for third-party / local skills:
 * - Center: Monogram letter extracted from the skill's name (or Folder glyph if no name).
 * - Bottom-Right Badge: Amber Link2 badge when namesake candidates exist to link.
 */
export function ThirdPartyMark({
  name,
  className,
  muted = false,
  candidate = false,
  showBadge = true,
  showTooltip = true,
}: {
  /** The skill's name (e.g. "git-commit"), used to derive the monogram. */
  name?: string;
  className?: string;
  /** The closed tone: dim presentation for disabled skills. */
  muted?: boolean;
  /** Whether namesake candidates exist to link (shows amber link indicator). */
  candidate?: boolean;
  /** Whether to render the bottom-right badge when size permits. */
  showBadge?: boolean;
  /** Whether to wrap the mark in a Tooltip. Defaults to true. */
  showTooltip?: boolean;
}) {
  const { t } = useTranslation();
  const compact = isMicroSize(className);
  const initial = name ? skillInitial(name) : null;

  const content = (
    <span
      role="img"
      aria-label={t("common.thirdPartyInstall")}
      className={cn(
        THIRD_PARTY_MARK_CLASS,
        muted && "opacity-60",
        className,
      )}
    >
      {initial ? (
        <>
          <span className="font-semibold uppercase select-none leading-none text-foreground">
            {initial}
          </span>
          {showBadge && candidate && !compact && (
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 flex size-[48%] min-w-3 min-h-3 items-center justify-center rounded-full ring-1.5 ring-background shadow-xs bg-amber-500 text-amber-950 dark:text-amber-100"
            >
              <Link2 className="size-[75%] stroke-[2.2]" />
            </span>
          )}
        </>
      ) : (
        <ThirdPartyMarkGlyph />
      )}
    </span>
  );

  if (!showTooltip) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipContent>
        {candidate
          ? t("sourceLink.tooltip")
          : t("common.thirdPartyInstallTip")}
      </TooltipContent>
    </Tooltip>
  );
}
