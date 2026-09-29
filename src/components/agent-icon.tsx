import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { Bot } from "lucide-react";

import { useAgentIcon } from "../hooks/use-agent-icons";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "../lib/utils";

/** Everything shadcn's `Avatar` accepts, plus the agent whose icon to show. */
interface AgentIconProps extends ComponentProps<typeof Avatar> {
  agentName: string;
  /**
   * `circle` (default) is the round avatar used in stacked groups; `squircle`
   * is the macOS-app-style rounded-square tile — the glyph inset on a
   * neutral card ground, corner radius ~22.5% of the side (the macOS
   * Big-Sur–style proportion).
   */
  shape?: "circle" | "squircle";
}

/**
 * Renders the colored brand icon for the given agent, resolved at runtime
 * against the agents-info dataset (`lib/agent-icons`) and loaded through the
 * CDN fallback chain. Candidate URLs are walked in order, one step per failed
 * load. Falls back to a generic Bot glyph when no dedicated icon is
 * available, while the dataset loads, or while the image loads; the glyph is
 * decorative — the label around the avatar carries the agent's name.
 */
export function AgentIcon({
  agentName,
  size = "default",
  className,
  shape = "circle",
  ...props
}: AgentIconProps) {
  const { candidates, mono, ground } = useAgentIcon(agentName);
  // Walk the candidate chain one step per failed load; past the last
  // candidate there is no src and the Bot fallback takes over.
  const [step, setStep] = useState(0);
  // A reused instance switching agents — or a freshly resolved map —
  // restarts the candidate chain.
  useEffect(() => setStep(0), [agentName, candidates.length]);
  const src = step < candidates.length ? candidates[step] : undefined;

  // Monochrome `currentColor` SVGs render black as <img>; flip them to white
  // so they stay legible on the dark surface. Colored icons keep their hues.
  const darkFixClass = mono ? "dark:invert" : undefined;
  // Surface-bound artwork (white glyph / black-dominant art on a transparent
  // background) is painted on a fixed contrasting ground in both modes.
  const groundClass =
    ground === "dark"
      ? "bg-neutral-900"
      : ground === "light"
        ? "bg-white"
        : undefined;

  if (shape === "squircle") {
    // A plain span instead of the round Avatar primitives, so no circular
    // class (`rounded-full`, the hairline `after:` ring) fights the square
    // shape. It adds no ground or inset of its own — the caller's tile
    // supplies the rounded square and its single padding, so the glyph fills
    // the tile the way a macOS icon's artwork fills its icon box (one inset
    // level, not a box inside a box).
    return (
      <span
        data-slot="agent-tile"
        className={cn(
          "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[22.5%]",
          className,
        )}
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setStep((s) => s + 1)}
            className={cn("h-full w-full object-contain", darkFixClass, groundClass)}
          />
        ) : (
          <Bot className="size-3/4 text-muted-foreground" aria-hidden="true" />
        )}
      </span>
    );
  }

  return (
    <Avatar size={size} className={className} {...props}>
      {src && (
        <AvatarImage
          key={src}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoadingStatusChange={(status) => {
            if (status === "error") setStep((s) => s + 1);
          }}
          className={cn(darkFixClass, groundClass)}
        />
      )}
      <AvatarFallback>
        <Bot aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
