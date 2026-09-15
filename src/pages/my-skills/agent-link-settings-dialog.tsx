import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "../../components/ui/toast";

import { INSTALLED_SKILLS_QUERY_KEY } from "../../hooks/use-installed-skills";
import {
  excludeAgent,
  includeAgent,
} from "../../lib/agent-link-preferences";
import {
  fetchAgentStatus,
  linkAgent,
  unlinkAgent,
} from "../../lib/local-skills";
import { cn, errorMessage } from "../../lib/utils";
import { AgentIcon } from "../../components/agent-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Switch } from "../../components/ui/switch";
import { agentStateDotClass, agentLinkState } from "./agent-link-state";
import { formatLinkMessage } from "./link-notice";

/**
 * Per-agent link control, opened from the avatar menu's settings gear.
 *
 * Linking is automatic everywhere else — this dialog is the one place a user
 * can opt an agent out. A switch off unlinks the agent (the backend restores
 * its parked content) and records the exclusion so the auto-link pass never
 * touches it again; a switch back on re-links (importing its own skills) and
 * clears the exclusion. Canonical agents use their native skills directory,
 * so their switch is pinned on and disabled.
 *
 * Every action writes through the backend and lands as a toast, like
 * `SkillEnableSwitch` — no confirm step, since unlink is fully reversible.
 */
export function AgentLinkSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  // Shared cache with the avatar menu; fetching is gated on open so the
  // dialog costs nothing while closed.
  const {
    data: agents,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    enabled: open,
  });

  const toggle = useMutation({
    mutationFn: ({ name, link }: { name: string; link: boolean }) =>
      link ? linkAgent(name, { migrate: true }) : unlinkAgent(name),
    onMutate: ({ name, link }) => {
      // The switch is the user's intent: record the exclusion before the
      // disk action so the auto-link pass honors it regardless of the
      // action's outcome.
      if (link) {
        includeAgent(name);
      } else {
        excludeAgent(name);
      }
    },
    onSuccess: (results) => {
      void queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      void queryClient.invalidateQueries({
        queryKey: INSTALLED_SKILLS_QUERY_KEY,
      });
      const notice = formatLinkMessage(results[0]);
      if (notice) {
        const type =
          notice.kind === "error"
            ? "error"
            : notice.kind === "warning"
              ? "warning"
              : "success";
        toast.add({ title: notice.text, type });
      }
    },
    onError: (err) =>
      toast.add({ title: errorMessage(err, "操作失败"), type: "error" }),
  });

  const busyFor = (name: string) =>
    toggle.isPending && toggle.variables?.name === name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agent 链接设置</DialogTitle>
          <DialogDescription>
            已检测到的 agent 会自动链接到统一的 skills
            目录，无需手动操作。在此可对个别 agent 取消链接，取消后不会再被自动链接。
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">
            加载失败：{errorMessage(error)}
          </p>
        ) : isLoading || !agents ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
            {agents.map((agent) => {
              const skillsCount = agent.internalSkills?.length ?? 0;
              const othersCount = agent.internalOthers?.length ?? 0;
              const pinned = agent.canonical;
              return (
                <div
                  key={agent.name}
                  className="flex items-center gap-2.5 py-2.5"
                >
                  <AgentIcon agentName={agent.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{agent.display}</div>
                    {(skillsCount > 0 || othersCount > 0) && (
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {skillsCount > 0 && (
                          <span>{skillsCount} 个 skill 待导入</span>
                        )}
                        {othersCount > 0 && (
                          <span>{othersCount} 个文件待备份</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      agentStateDotClass[agentLinkState(agent)],
                    )}
                  />
                  <Switch
                    checked={agent.linked || pinned}
                    disabled={pinned || busyFor(agent.name)}
                    onCheckedChange={(link) =>
                      toggle.mutate({ name: agent.name, link })
                    }
                    aria-label={`${agent.display} 链接开关`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
