import { useEffect, useMemo, useState } from "react";

import { avatarCandidates } from "../lib/avatar-source";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "../lib/utils";

/**
 * Round owner avatar loaded from the mirror, degrading through GitHub's
 * avatar endpoint and finally to the owner's initial. Candidate URLs are
 * walked in order via the avatar's loading status, one step per failure; the
 * list itself lives in `lib/avatar-source.ts`, so the image this draws and the
 * image `lib/owner-tint.ts` samples for colour can never disagree.
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
  const candidates = useMemo(() => avatarCandidates(owner), [owner]);
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
