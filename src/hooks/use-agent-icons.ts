import { useMemo } from "react";

import { AGENT_ICON_MAP } from "../data/agent-icons.generated";
import { agentIconCandidates, agentIconTraits } from "../lib/agent-icons";

/**
 * Resolve one agent's brand icon against the vendored dataset map: the
 * icon's local candidate URL, plus the rendering traits its artwork needs.
 * Unresolved agents — unknown name, or the null-icon catch-all — come back
 * with no candidates, which AgentIcon draws as the Bot fallback.
 */
export function useAgentIcon(agentName: string) {
  const icon = AGENT_ICON_MAP[agentName];
  const candidates = useMemo(
    () => (icon ? agentIconCandidates(icon) : []),
    [icon],
  );
  const traits = useMemo(
    () => (icon ? agentIconTraits(icon) : { mono: false, ground: undefined }),
    [icon],
  );

  return { candidates, mono: traits.mono, ground: traits.ground };
}
