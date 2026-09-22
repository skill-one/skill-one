import { useEffect, useMemo, useState } from "react";

import { fileCandidates, getIndexTag } from "../lib/cdn-config";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "../lib/utils";

/**
 * The dataset repo hosts every owner's avatar as a regular repo file (copied
 * from GitHub at snapshot time), so avatars ride the same download source and
 * CDN fallback chain as SKILL.md and the index — `upstream/avatars/{owner}.png`
 * at the recorded snapshot tag (immutable, cache-safe), the mutable `dist`
 * branch before any tag has been recorded. GitHub's own avatar endpoint stays
 * at the end of the chain as a fallback for owners whose copy the dataset
 * missed (a failed download run leaves a hole until the next one).
 */
const MIRROR_REPO = "skill-one/skills-profiles";

/**
 * Round owner avatar loaded from the mirror, degrading through GitHub's
 * avatar endpoint and finally to the owner's initial. Candidate URLs are
 * walked in order via the avatar's loading status, one step per failure.
 *
 * Decoration: every call site prints the owner or the repo it belongs to as
 * text right beside it, so the avatar is marked aria-hidden and its image
 * carries an empty alt — otherwise the face (or worse, the fallback's initial)
 * would leak into the accessible name of whatever it sits in, e.g. the detail
 * drawer's repo link.
 */
export function OwnerAvatar({
  owner,
  className,
}: {
  owner: string;
  className?: string;
}) {
  const candidates = useMemo(() => {
    const spec = {
      repo: MIRROR_REPO,
      path: `upstream/avatars/${encodeURIComponent(owner)}.png`,
      ref: getIndexTag() || "dist",
    };
    return [...fileCandidates(spec), `https://github.com/${owner}.png`];
  }, [owner]);
  const [step, setStep] = useState(0);
  // A reused instance switching owners restarts the candidate chain.
  useEffect(() => setStep(0), [owner]);
  const src = candidates[Math.min(step, candidates.length - 1)];

  return (
    <Avatar
      aria-hidden="true"
      className={cn("border border-border/60 bg-muted", className)}
    >
      <AvatarImage
        key={src}
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoadingStatusChange={(status) => {
          if (status === "error") setStep((s) => s + 1);
        }}
      />
      {/* text-inherit drops the fallback's own text-sm so the caller's font
          size (carried on the root) still applies to the initial. */}
      <AvatarFallback className="text-inherit font-semibold uppercase">
        {owner.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}
