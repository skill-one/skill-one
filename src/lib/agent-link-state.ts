import type { ParseKeys } from "i18next";

import type { AgentStatus } from "./skills-manager";

/**
 * The three link states an agent can present, derived once wherever state is
 * shown — the agents graph's ribbons and node cards, the my-skills entry
 * card, and the link settings dialog.
 */
export type AgentLinkState = "linked" | "warning" | "unlinked";

/**
 * Classify an agent for display. The canonical dir reports linked=false, but
 * to users it is effectively linked; unlinked agents whose own directory
 * already holds skills or other files surface the warning state (the graph
 * draws them in amber and their pending counts ride the node card).
 */
export function agentLinkState(agent: AgentStatus): AgentLinkState {
  if (agent.linked || agent.canonical) return "linked";
  const hasContent =
    (agent.internalSkills?.length ?? 0) > 0 ||
    (agent.internalOthers?.length ?? 0) > 0;
  return hasContent ? "warning" : "unlinked";
}

/** Short status label key for the graph's node cards; the canonical agent keeps its own word. */
export function agentStateLabelKey(agent: AgentStatus): ParseKeys {
  if (agent.canonical) return "agent.native";
  return agentLinkState(agent) === "linked"
    ? "agent.linked"
    : "agent.unlinked";
}

/** Status dot color used on the node cards (and as the ribbon-state reference). */
export const agentStateDotClass: Record<AgentLinkState, string> = {
  linked: "bg-emerald-500",
  warning: "bg-amber-500",
  unlinked: "bg-muted-foreground",
};
