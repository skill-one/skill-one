import type { AgentStatus } from "../../lib/skills-manager";
import { AgentIcon } from "../../components/agent-icon";
import {
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from "../../components/ui/avatar";
import { agentLinkState, agentStateDotClass } from "./agent-link-state";

/** Agents shown inline before the strip collapses the rest into a +N count. */
export const AVATAR_GROUP_MAX = 4;

/**
 * The agent link strip: overlapping shadcn avatars (brand icon, Bot fallback,
 * ring-background separation) with a small status dot per avatar — green when
 * linked, amber when the agent's own dir still holds content — plus a +N count
 * once more agents exist than fit inline.
 *
 * Purely presentational: the strip is the trigger of the dropdown menu that
 * carries every action, so it owns no click target and no styling beyond what
 * shadcn's avatar group already provides.
 */
export function AgentAvatarGroup({ agents }: { agents: AgentStatus[] }) {
  const visible = agents.slice(0, AVATAR_GROUP_MAX);
  const hiddenCount = agents.length - visible.length;

  return (
    <AvatarGroup>
      {visible.map((agent) => (
        // Each avatar must stay a direct child of AvatarGroup: the group's
        // overlap and ring are applied through the `data-slot=avatar` selector.
        <AgentIcon key={agent.name} agentName={agent.name}>
          <AvatarBadge className={agentStateDotClass[agentLinkState(agent)]} />
        </AgentIcon>
      ))}
      {hiddenCount > 0 && <AvatarGroupCount>+{hiddenCount}</AvatarGroupCount>}
    </AvatarGroup>
  );
}
