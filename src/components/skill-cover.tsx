import { useEffect, useMemo, useState } from "react";

import { skillCoverCandidates } from "../lib/skill-profile-api";
import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

/**
 * A skill's own image — the square cover illustration the skills-profiles
 * dataset renders per skill (a PNG published next to that skill's profile
 * files). This is the leading image of every skill surface, the way a store
 * leads with the app's icon.
 *
 * Distinct from `OwnerAvatar`, which is the *source repository's* owner
 * avatar: that one is a provenance fact about who published the skill, so it
 * rides the source line instead of standing in for the skill itself.
 *
 * Covers are garnish. The dataset only illustrates the skills it has
 * processed, and a hand-placed local install has no id to address one with,
 * so the slot degrades to the author's initial (`repo`'s owner segment, or
 * the skill's own name when even the source is unknown). The footprint never
 * collapses, so a grid mixing covered and uncovered skills still reads as one
 * column.
 */
export function SkillCover({
  repo,
  name,
  className,
}: {
  /** `owner/repo` the skill came from; absent skips straight to the initial. */
  repo?: string;
  /** Skill name (the registry slug), the cover id's third segment. */
  name?: string;
  /** The image's footprint, which each caller sizes to its own slot. */
  className?: string;
}) {
  // The cover's address: the canonical skills.sh id is `{owner}/{repo}/{slug}`,
  // which for a skill is exactly its `repo/name`.
  const id = repo && name ? `${repo}/${name}` : "";
  const candidates = useMemo(() => (id ? skillCoverCandidates(id) : []), [id]);
  const [step, setStep] = useState(0);
  // A reused instance switching skills restarts the candidate chain.
  useEffect(() => setStep(0), [id]);
  const src = candidates[Math.min(step, candidates.length - 1)];
  // The owner is the skill's author; a skill with no recorded source still
  // gets its own initial rather than an empty slot.
  const initial = (repo?.split("/")[0] || name || "?").charAt(0);

  return (
    // One accessible name for the whole slot, so the cover and its initial
    // fallback are never announced as two different things. The square shape
    // is the caller's, laid over the avatar primitive's round default; the
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
      {src && (
        <AvatarImage
          key={src}
          src={src}
          // Decorative: the root carries the name for assistive tech.
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoadingStatusChange={(status) => {
            if (status === "error") setStep((s) => s + 1);
          }}
        />
      )}
      {/* text-inherit drops the fallback's own text-sm so the caller's font
          size (carried on the root) still applies to the initial. */}
      <AvatarFallback className="rounded-lg bg-transparent text-inherit font-semibold text-muted-foreground uppercase">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
