import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  Loader2,
  Users,
} from "lucide-react";

import {
  fetchAgentStatus,
  linkAgent,
  linkAllAgents,
  unlinkAgent,
} from "../../lib/local-skills";
import type { AgentStatus } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { INSTALLED_SKILLS_QUERY_KEY } from "../../hooks/use-installed-skills";
import { AgentIcon } from "../../components/agent-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { AgentAvatarGroup } from "./agent-avatar-group";
import { agentLinkState, agentStateDotClass, agentStateLabel } from "./agent-link-state";
import { formatBulkLinkMessage, formatLinkMessage, type Notice } from "./link-notice";
import {
  LinkConfirmDialog,
  type LinkConfirmTarget,
} from "./link-confirm-dialog";

/**
 * The agent link strip on the "my skills" page: a shadcn avatar group that
 * opens one dropdown menu listing every detected agent, plus the mutations
 * behind it (link / confirm-link / unlink) and the link confirm dialog.
 *
 * Since `agents-skills` 0.9 nothing blocks a link and nothing needs choosing:
 * confirming links the agent and the backend handles the content — skills are
 * adopted into the canonical dir, everything else parks into the agent's
 * backup slot and is restored on unlink. Clicking a linked agent unlinks
 * directly (parked content is restored automatically); a canonical agent only
 * explains itself.
 *
 * Every action funnels through the menu, so the strip itself stays a single
 * click target and each agent keeps the same treatment no matter how many are
 * detected — the group only ever shows a prefix of them inline.
 */
export function AgentAvatarMenu() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<LinkConfirmTarget | null>(
    null,
  );
  const queryClient = useQueryClient();

  const {
    data: agents,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    staleTime: 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["agent-status"] });
    queryClient.invalidateQueries({ queryKey: INSTALLED_SKILLS_QUERY_KEY });
  };

  /** Build the confirm target for an unlinked agent, or `null` when its dir is empty. */
  const buildConfirmTarget = (agent: AgentStatus): LinkConfirmTarget | null => {
    const skills = agent.internalSkills ?? [];
    const others = agent.internalOthers ?? [];
    if (skills.length === 0 && others.length === 0) return null;
    return {
      name: agent.name,
      display: agent.display,
      skills,
      others,
      backup: agent.pendingBackup ?? null,
    };
  };

  const confirmMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name, { migrate: true }),
    onSuccess: (results) => {
      setConfirmTarget(null);
      invalidate();
      setNotice(formatLinkMessage(results[0]));
    },
    onError: (err) =>
      setNotice({
        text: `链接失败：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
      }),
  });

  const linkMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name),
    onSuccess: (results) => {
      invalidate();
      setNotice(formatLinkMessage(results[0]));
    },
    onError: (err) =>
      setNotice({
        text: `链接失败：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
      }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (name: string) => unlinkAgent(name),
    onSuccess: (results) => {
      invalidate();
      setNotice(formatLinkMessage(results[0]));
    },
    onError: (err) =>
      setNotice({
        text: `取消链接失败：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
      }),
  });

  const linkAllMutation = useMutation({
    mutationFn: (names: string[]) => linkAllAgents(names),
    onSuccess: (results) => {
      invalidate();
      setNotice(formatBulkLinkMessage(results));
    },
    onError: (err) =>
      setNotice({
        text: `一键链接失败：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
      }),
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleSelect = (agent: AgentStatus) => {
    if (agent.canonical) {
      setNotice({
        text: `${agent.display} 使用原生 skills 目录，无法取消链接`,
        kind: "warning",
      });
      return;
    }
    if (agent.linked) {
      // Parked content is restored automatically by the backend; the toast
      // reports it.
      unlinkMutation.mutate(agent.name);
      return;
    }
    // A dir that already holds skills or other files opens the confirm dialog
    // (which shows what confirming will do); an empty dir links directly.
    const target = buildConfirmTarget(agent);
    if (target) {
      // Radix hands focus back to the trigger as the menu closes; opening the
      // dialog one frame later keeps the two from fighting over it.
      requestAnimationFrame(() => setConfirmTarget(target));
      return;
    }
    linkMutation.mutate(agent.name);
  };

  const list = agents ?? [];
  // Agents 一键链接 can act on: unlinked and not using their own native dir.
  const linkable = list.filter((agent) => !agent.linked && !agent.canonical);
  const busyFor = (name: string) =>
    linkAllMutation.isPending ||
    (linkMutation.isPending && linkMutation.variables === name) ||
    (confirmMutation.isPending && confirmMutation.variables === name) ||
    (unlinkMutation.isPending && unlinkMutation.variables === name);
  // Only one confirm dialog exists at a time, so any pending mutation
  // disables it.
  const dialogBusy =
    linkMutation.isPending ||
    confirmMutation.isPending ||
    unlinkMutation.isPending;

  return (
    <div>
      {/* Results surface as a floating toast (fixed positioning): appearing
          and disappearing never shifts layout. The left color bar and the
          status icon distinguish success (green) / warning (amber) / error. */}
      {notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div
            role="status"
            className={cn(
              "pointer-events-auto flex max-w-md items-start gap-2.5 animate-in fade-in-0 slide-in-from-bottom-2 rounded-lg border border-border/70 border-l-4 bg-popover px-3.5 py-2.5 text-[12px] text-popover-foreground shadow-lg duration-200",
              notice.kind === "success" && "border-l-emerald-500",
              notice.kind === "warning" && "border-l-amber-500",
              notice.kind === "error" && "border-l-destructive",
            )}
          >
            {notice.kind === "success" && (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
            {notice.kind === "warning" && (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}
            {notice.kind === "error" && (
              <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            )}
            <span className="leading-relaxed">{notice.text}</span>
          </div>
        </div>
      )}

      {isError ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Users className="h-7 w-7 opacity-40" />
          <p className="text-[12px]">
            加载失败：{error instanceof Error ? error.message : "未知错误"}
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Users className="h-7 w-7 opacity-40" />
          <p className="text-[12px]">未检测到可用的 agent</p>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`管理 agent 链接（共 ${list.length} 个）`}
              className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <AgentAvatarGroup agents={list} />
            </button>
          </DropdownMenuTrigger>

          {/* The menu lists every agent, including the ones the strip folds
              into its +N count, so all of them are handled the same way. */}
          <DropdownMenuContent align="start" className="min-w-64">
            <DropdownMenuLabel className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-normal text-muted-foreground">
                Agents · 共 {list.length} 个
              </span>
              {/* A plain button (not a menu item) so the bulk link keeps the
                  menu open: statuses refresh in place via the query refetch. */}
              <button
                type="button"
                disabled={
                  linkable.length === 0 || linkAllMutation.isPending
                }
                onClick={(e) => {
                  e.stopPropagation();
                  linkAllMutation.mutate(linkable.map((agent) => agent.name));
                }}
                className="flex shrink-0 items-center gap-1 rounded text-[11px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {linkAllMutation.isPending && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                一键链接
              </button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {list.map((agent) => {
                const skillsCount = agent.internalSkills?.length ?? 0;
                const othersCount = agent.internalOthers?.length ?? 0;
                return (
                  <DropdownMenuItem
                    key={agent.name}
                    disabled={busyFor(agent.name)}
                    onSelect={() => handleSelect(agent)}
                    className="gap-2.5"
                  >
                    <AgentIcon agentName={agent.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">
                        {agent.display}
                      </div>
                      {/* Pending-action counts, shown only when there is
                          something a link would do to this agent's dir. */}
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
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          agentStateDotClass[agentLinkState(agent)],
                        )}
                      />
                      {agentStateLabel(agent)}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <LinkConfirmDialog
        target={confirmTarget}
        busy={dialogBusy}
        onConfirm={() => {
          if (confirmTarget) confirmMutation.mutate(confirmTarget.name);
        }}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}
