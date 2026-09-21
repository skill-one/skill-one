import { cn } from "../lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";

/**
 * A skill's own image slot. The dataset does not publish per-skill cover
 * illustrations, so the slot always shows the author's initial — a stable,
 * offline mark that still gives every card a per-skill anchor and keeps the
 * grid's leading column aligned.
 *
 * Distinct from `OwnerAvatar`, which is the *source repository's* owner
 * avatar: that one is a provenance fact about who published the skill, so it
 * rides the source line instead of standing in for the skill itself.
 *
 * The footprint never collapses, so a grid mixing sourced and unsourced
 * skills still reads as one column.
 */
export function SkillCover({
  repo,
  name,
  className,
}: {
  /** `owner/repo` the skill came from; absent uses the skill's own name. */
  repo?: string;
  /** Skill name (the registry slug). */
  name?: string;
  /** The image's footprint, which each caller sizes to its own slot. */
  className?: string;
}) {
  // The owner is the skill's author; a skill with no recorded source still
  // gets its own initial rather than an empty slot.
  const initial = (repo?.split("/")[0] || name || "?").charAt(0);

  return (
    // One accessible name for the whole slot. The square shape is the
    // caller's, laid over the avatar primitive's round default; the
    // `data-slot` is this component's own marker so a cover never counts as
    // an owner avatar.
    <Avatar
      role="img"
      aria-label={`${name ?? repo ?? "skill"} 封面图`}
      data-slot="skill-cover"
      className={cn(
        "rounded-lg border border-border/60 bg-muted",
        className,
      )}
    >
      {/* text-inherit drops the fallback's own text-sm so the caller's font
          size (carried on the root) still applies to the initial. */}
      <AvatarFallback className="rounded-lg bg-transparent text-inherit font-semibold text-muted-foreground uppercase">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
