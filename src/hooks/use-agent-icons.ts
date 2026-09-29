import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  agentIconCandidates,
  agentIconTraits,
  loadAgentIcons,
  readStoredAgentIcons,
} from "../lib/agent-icons";

/**
 * The manifest query is shared by every AgentIcon on screen. `initialData`
 * seeds it from the localStorage copy, so a warm start paints real icons
 * immediately; `staleTime` keeps that copy authoritative for the session's
 * first half hour, after which one background refresh picks up dataset
 * changes. A failed refresh (offline) leaves the seeded data on screen.
 */
const AGENT_ICONS_STALE_TIME_MS = 30 * 60 * 1000;

/**
 * Resolve one agent's brand icon against the dataset map: the icon's
 * candidate URLs (CDN fallback chain), plus the rendering traits its artwork
 * needs. Unresolved agents — unknown name, null icon, dataset unreachable on
 * first run — come back with no candidates, which AgentIcon draws as the Bot
 * fallback.
 */
export function useAgentIcon(agentName: string) {
  const { data } = useQuery({
    queryKey: ["agent-icons"],
    queryFn: loadAgentIcons,
    initialData: readStoredAgentIcons() ?? undefined,
    staleTime: AGENT_ICONS_STALE_TIME_MS,
    retry: false,
  });

  const icon = data?.[agentName];
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
