import { Bot } from "lucide-react";

import { getAgentIconUrl } from "../lib/agent-icons";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface AgentIconProps {
  agentName: string;
  className?: string;
}

/**
 * Renders a colored brand icon for the given agent (from LobeHub's static-svg
 * `-color` assets) as a shadcn avatar. Falls back to a generic Bot glyph when
 * no dedicated icon is available (or while the image loads).
 */
export function AgentIcon({ agentName, className }: AgentIconProps) {
  const iconUrl = getAgentIconUrl(agentName);

  return (
    <Avatar className={className}>
      {iconUrl && <AvatarImage src={iconUrl} alt="" />}
      <AvatarFallback>
        <Bot aria-label={agentName} />
      </AvatarFallback>
    </Avatar>
  );
}
