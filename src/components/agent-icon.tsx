import { Bot } from "lucide-react";

import { getAgentIconUrl } from "../lib/agent-icons";

interface AgentIconProps {
  agentName: string;
  className?: string;
}

/**
 * Renders a colored brand icon for the given agent (from LobeHub's static-svg
 * `-color` assets). Falls back to a generic Bot glyph when no dedicated icon
 * is available.
 */
export function AgentIcon({ agentName, className }: AgentIconProps) {
  const iconUrl = getAgentIconUrl(agentName);

  if (!iconUrl) {
    return <Bot className={className} aria-label={agentName} />;
  }

  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden
      className={className}
      width={28}
      height={28}
    />
  );
}
