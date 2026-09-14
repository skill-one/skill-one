import { Puzzle } from "lucide-react";

import { cn } from "../lib/utils";
import { OwnerAvatar } from "./owner-avatar";

/**
 * The avatar of a skill's source: the owner's GitHub avatar when the source is
 * known, and the same footprint with a Puzzle glyph when it is not (a skill
 * placed into the global directory by hand, or installed before the provenance
 * ledger existed).
 *
 * One component so the card, the detail drawer and the migration popover cannot
 * disagree about what an unknown source looks like — they used to spell the
 * placeholder out three times, at three sizes. Both are round, so a list mixing
 * sourced and unsourced skills still reads as one column.
 *
 * `source` is the `owner/repo` string the surfaces already carry: the owner
 * segment is what the mirror hosts an avatar for, and a bare owner (no slash)
 * is treated as empty rather than as a repo-less source.
 */
export function SkillAvatar({
  source,
  className,
  iconClassName,
}: {
  /** `owner/repo`; absent (or without an owner) renders the placeholder. */
  source?: string;
  /** The avatar's footprint, which each caller sizes to its own slot. */
  className?: string;
  /** The placeholder glyph's size, which does not scale with the footprint. */
  iconClassName?: string;
}) {
  const owner = source?.split("/")[0];
  if (!owner) {
    return (
      <div
        aria-label="skill 头像"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-muted-foreground",
          className,
        )}
      >
        <Puzzle className={cn("h-3.5 w-3.5", iconClassName)} />
      </div>
    );
  }
  return <OwnerAvatar owner={owner} className={cn("shrink-0", className)} />;
}
