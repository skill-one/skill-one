import { Bot } from "lucide-react";

import type { AgentStatus } from "../../lib/skills-manager";
import { getAgentIconUrl } from "../../lib/agent-icons";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import {
  agentLinkState,
  agentStateDotClass,
  agentStateLabel,
  agentStateRingClass,
} from "./agent-link-state";

/** Agents shown inline before the strip collapses the rest into a +N count. */
export const AVATAR_GROUP_MAX = 8;

/**
 * The collapsed form of the agent link strip: the first AVATAR_GROUP_MAX
 * agents as overlapping circular avatars plus a +N count for the rest, so a
 * machine with many detected agents keeps the strip to one short row. The
 * ring color carries the link status. This layer is a read-only glance —
 * hover previews the status, any click (avatar or count) hands over to the
 * full interactive grid, keeping link/unlink away from the tight overlap
 * where a misclick would silently unlink an agent.
 */
export function AgentAvatarGroup({
  agents,
  onExpand,
}: {
  agents: AgentStatus[];
  onExpand: () => void;
}) {
  const visible = agents.slice(0, AVATAR_GROUP_MAX);
  const hiddenCount = agents.length - visible.length;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center">
        {visible.map((agent, index) => (
          <CollapsedAgentAvatar
            key={agent.name}
            agent={agent}
            overlap={index > 0}
            onExpand={onExpand}
          />
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={onExpand}
            title={`共 ${agents.length} 个 agent`}
            aria-label={`展开全部 ${agents.length} 个 agent`}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-2 ring-border transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
              visible.length > 0 && "-ml-2",
            )}
          >
            +{hiddenCount}
          </button>
        )}
      </div>
    </TooltipProvider>
  );
}

/** One avatar in the collapsed strip: status ring + name/status tooltip. */
function CollapsedAgentAvatar({
  agent,
  overlap,
  onExpand,
}: {
  agent: AgentStatus;
  overlap: boolean;
  onExpand: () => void;
}) {
  const state = agentLinkState(agent);
  const iconUrl = getAgentIconUrl(agent.name);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`${agent.display}，${agentStateLabel(agent)}，点击展开`}
          className={cn(
            "relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
            overlap && "-ml-2",
          )}
        >
          <Avatar
            className={cn(
              "size-10 bg-muted ring-2",
              agentStateRingClass[state],
              // Unlinked agents fade out, mirroring the expanded grid's icons.
              state !== "linked" && "grayscale opacity-70",
            )}
          >
            {iconUrl && <AvatarImage src={iconUrl} alt="" />}
            <AvatarFallback>
              <Bot className="size-5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-2.5 py-1.5">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-popover-foreground">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", agentStateDotClass[state])}
          />
          {agent.display}
          <span className="text-[10px] font-normal text-muted-foreground">
            {agentStateLabel(agent)}
          </span>
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          点击展开全部 agent
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
