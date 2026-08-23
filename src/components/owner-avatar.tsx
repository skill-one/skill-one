import { useState } from "react";

import { cn } from "../lib/utils";

/**
 * Round owner avatar loaded from GitHub, degrading to the owner's initial
 * when the image fails to load. Avatars are user assets rather than repo
 * files, so unlike SKILL.md they cannot be served through a repo CDN mirror
 * (jsDelivr/JSDMirror) — a graceful local fallback is the best available
 * degradation when github.com is unreachable.
 */
export function OwnerAvatar({
  owner,
  className,
}: {
  owner: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-label={`${owner} 的头像`}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted font-semibold uppercase text-muted-foreground",
          className,
        )}
      >
        {owner.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={`https://github.com/${owner}.png`}
      alt={`${owner} 的头像`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 rounded-full border border-border/60 bg-muted",
        className,
      )}
    />
  );
}
