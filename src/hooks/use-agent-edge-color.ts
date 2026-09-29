import { AGENT_ICON_MAP } from "../data/agent-icons.generated";
import { agentEdgeColor } from "../lib/agent-icons";

/**
 * The agent-side color of one graph ribbon: the precomputed average color of
 * the agent's brand icon, read synchronously from the vendored table (see
 * `lib/agent-icons`). Monochrome glyphs, unresolved icons and files outside
 * the table resolve to `undefined` — those ribbons stay neutral instead of
 * flashing a wrong color.
 *
 * Like `FILE_TRAITS`, the color travels with the artwork, not the agent name.
 */
export function useAgentEdgeColor(agentName: string): string | undefined {
  const icon = AGENT_ICON_MAP[agentName];
  if (!icon) return undefined;
  return agentEdgeColor(icon);
}
