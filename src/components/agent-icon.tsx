import type { ComponentProps } from "react";
import { Bot } from "lucide-react";

import { getAgentIconUrl, isMonochromeAgentIcon } from "../lib/agent-icons";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

/** Everything shadcn's `Avatar` accepts, plus the agent whose icon to show. */
interface AgentIconProps extends ComponentProps<typeof Avatar> {
  agentName: string;
}

/**
 * Renders a colored brand icon for the given agent (from LobeHub's static-svg
 * `-color` assets) as a shadcn avatar. Falls back to a generic Bot glyph when
 * no dedicated icon is available (or while the image loads); the glyph is
 * decorative — the label around the avatar carries the agent's name.
 */
export function AgentIcon({
  agentName,
  size = "default",
  className,
  ...props
}: AgentIconProps) {
  const iconUrl = getAgentIconUrl(agentName);
  // Monochrome `currentColor` SVGs render black as <img>; flip them to white
  // so they stay legible on the dark background. Colored icons keep their hues.
  const darkFixClass = isMonochromeAgentIcon(agentName) ? "dark:invert" : undefined;

  return (
    <Avatar size={size} className={className} {...props}>
      {iconUrl && (
        <AvatarImage src={iconUrl} alt="" className={darkFixClass} />
      )}
      <AvatarFallback>
        <Bot aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
