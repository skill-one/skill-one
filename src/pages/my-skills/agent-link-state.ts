import type { AgentStatus } from "../../lib/skills-manager";

/**
 * The three link states an agent can present, derived once for the menu rows
 * that carry every action. The collapsed avatar strip is deliberately not a
 * consumer: it shows no state, leaving the menu it opens to report it.
 */
export type AgentLinkState = "linked" | "warning" | "unlinked";

/**
 * Classify an agent for display. The canonical dir reports linked=false, but
 * to users it is effectively linked; unlinked agents whose own directory
 * already holds skills or other files surface the warning state (a confirm
 * dialog follows on click in the expanded grid).
 */
export function agentLinkState(agent: AgentStatus): AgentLinkState {
  if (agent.linked || agent.canonical) return "linked";
  const hasContent =
    (agent.internalSkills?.length ?? 0) > 0 ||
    (agent.internalOthers?.length ?? 0) > 0;
  return hasContent ? "warning" : "unlinked";
}

/** Short status label for tooltips; the canonical agent keeps its own word. */
export function agentStateLabel(agent: AgentStatus): string {
  if (agent.canonical) return "原生";
  return agentLinkState(agent) === "linked" ? "已链接" : "未链接";
}

/** Status dot color used in the menu rows' tooltips. */
export const agentStateDotClass: Record<AgentLinkState, string> = {
  linked: "bg-emerald-500",
  warning: "bg-amber-500",
  unlinked: "bg-muted-foreground",
};
