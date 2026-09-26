import type { AgentStatus } from "../../lib/skills-manager";
import { AgentIcon } from "../../components/agent-icon";
import { AvatarGroup, AvatarGroupCount } from "../../components/ui/avatar";

/** Agents shown inline before the strip collapses the rest into a +N count. */
export const AVATAR_GROUP_MAX = 2;

/**
 * The agent avatar strip: overlapping shadcn avatars (brand icon, Bot
 * fallback, ring-background separation) plus a +N count once more agents exist
 * than fit inline. Link state is not encoded here — the surface that embeds
 * the strip carries each agent's state elsewhere.
 *
 * Purely presentational. `max` lets a roomier surface (the my-skills entry
 * card) show more faces than the old header strip could.
 */
export function AgentAvatarGroup({
  agents,
  max = AVATAR_GROUP_MAX,
}: {
  agents: AgentStatus[];
  max?: number;
}) {
  const visible = agents.slice(0, max);
  const hiddenCount = agents.length - visible.length;

  return (
    <AvatarGroup>
      {visible.map((agent) => (
        // Each avatar must stay a direct child of AvatarGroup: the group's
        // overlap and ring are applied through the `data-slot=avatar` selector.
        <AgentIcon key={agent.name} agentName={agent.name} />
      ))}
      {hiddenCount > 0 && <AvatarGroupCount>+{hiddenCount}</AvatarGroupCount>}
    </AvatarGroup>
  );
}
