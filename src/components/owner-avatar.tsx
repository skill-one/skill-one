import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
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
  return (
    <Avatar className={cn("border border-border/60 bg-muted", className)}>
      <AvatarImage
        src={`https://github.com/${owner}.png`}
        alt={`${owner} 的头像`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      {/* text-inherit drops the fallback's own text-sm so the caller's font
          size (carried on the root) still applies to the initial. */}
      <AvatarFallback className="text-inherit font-semibold uppercase">
        {owner.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}
