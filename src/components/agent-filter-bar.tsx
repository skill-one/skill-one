import { User } from "lucide-react";

interface AgentItem {
  initials: string;
  color: string;
  count?: number;
}

const agents: AgentItem[] = [
  { initials: "AR", color: "bg-blue-500 text-white" },
  { initials: "RV", color: "bg-blue-500 text-white" },
  { initials: "TS", color: "bg-green-500 text-white" },
  { initials: "DB", color: "bg-red-500 text-white" },
  { initials: "DW", color: "bg-orange-500 text-white" },
  { initials: "SB", color: "bg-muted text-muted-foreground", count: 3 },
  { initials: "DD", color: "bg-muted text-muted-foreground", count: 5 },
  { initials: "DO", color: "bg-muted text-muted-foreground", count: 2 },
];

export function AgentFilterBar() {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <User className="h-4 w-4" />
        <span>Agent</span>
      </div>
      <div className="flex items-center gap-1.5">
        {agents.map((agent) => (
          <button
            key={agent.initials}
            className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium transition-opacity hover:opacity-80 ${agent.color}`}
          >
            {agent.initials}
            {agent.count !== undefined && (
              <span className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white">
                {agent.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
