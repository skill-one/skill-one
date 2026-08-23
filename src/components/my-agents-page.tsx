import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";

import {
  fetchAgentStatus,
  fetchInstalledSkills,
  linkAgent,
  unlinkAgent,
} from "../lib/local-skills";
import type {
  AgentLinkResult,
  AgentStatus,
} from "../lib/skills-manager";
import { LinkMigrationDialog } from "./link-migration-dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

function formatLinkMessage(result: AgentLinkResult | undefined): string {
  if (!result) return "";
  const label = `${result.display}（${result.agent}）`;
  switch (result.status) {
    case "linked":
      return `${label} 已链接`;
    case "alreadyLinked":
      return `${label} 已链接过`;
    case "migrated":
      return `${label} 已迁移（移动 ${result.moved.length} 个，跳过 ${result.skipped.length} 个）`;
    case "refused":
      return `${label} 拒绝：${result.message ?? "未提供原因"}`;
    case "skipped":
      return `${label} 已跳过`;
    case "failed":
      return `${label} 失败：${result.message ?? "未知错误"}`;
    case "unlinked":
      return `${label} 已取消链接`;
    case "notLinked":
      return `${label} 未链接`;
    default:
      return "";
  }
}

function AgentRow({
  agent,
  linking,
  unlinking,
  onLink,
  onUnlink,
}: {
  agent: AgentStatus;
  linking: boolean;
  unlinking: boolean;
  onLink: () => void;
  onUnlink: () => void;
}) {
  const busy = linking || unlinking;
  return (
    <div className="group flex items-center gap-4 rounded-xl border border-border/70 bg-card p-3.5 transition-all duration-150 hover:border-border hover:shadow-[0_6px_20px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors">
        <Bot className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-foreground">
            {agent.display}
          </span>
          <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {agent.name}
          </code>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {agent.canonical
            ? "使用原生 skills 目录，无需链接"
            : agent.linked
              ? "已链接到规范 skills 目录"
              : "尚未链接，点击「链接」接入规范 skills 目录"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {agent.canonical ? (
          <Badge variant="outline" className="text-[10px]">
            原生目录
          </Badge>
        ) : agent.linked ? (
          <Badge className="text-[10px]">已链接</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            未链接
          </Badge>
        )}

        {!agent.canonical &&
          (agent.linked ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={onUnlink}
            >
              {unlinking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2Off className="h-3.5 w-3.5" />
              )}
              取消链接
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={onLink}
            >
              {linking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              链接
            </Button>
          ))}
      </div>
    </div>
  );
}

export function MyAgentsPage() {
  const [notice, setNotice] = useState<string | null>(null);
  /** Set when a link attempt was refused because the agent dir holds skills. */
  const [pendingRefusal, setPendingRefusal] = useState<AgentLinkResult | null>(
    null,
  );
  const queryClient = useQueryClient();

  const {
    data: agents,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["agent-status"],
    queryFn: fetchAgentStatus,
    staleTime: 0,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["agent-status"] });

  // Only fetched while the migration dialog is open: it tells which skills the
  // canonical dir already provides, so migration would skip them.
  const { data: installedSkills } = useQuery({
    queryKey: ["installed-skills"],
    queryFn: fetchInstalledSkills,
    enabled: pendingRefusal != null,
  });
  const installedNames = useMemo(
    () => (installedSkills ?? []).map((skill) => skill.name),
    [installedSkills],
  );

  const linkMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name),
    onSuccess: (results) => {
      const result = results[0];
      // A refusal is recoverable: offer to migrate the existing skills rather
      // than reporting it as a failure.
      if (result?.status === "refused") {
        setPendingRefusal(result);
        return;
      }
      invalidate();
      setNotice(formatLinkMessage(result));
    },
    onError: (err) =>
      setNotice(`链接失败：${err instanceof Error ? err.message : String(err)}`),
  });

  const migrateMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name, { migrate: true }),
    onSuccess: (results) => {
      invalidate();
      // Migration moves skills into the canonical dir, so that list is stale.
      queryClient.invalidateQueries({ queryKey: ["installed-skills"] });
      setPendingRefusal(null);
      setNotice(formatLinkMessage(results[0]));
    },
    onError: (err) => {
      setPendingRefusal(null);
      setNotice(`迁移失败：${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (name: string) => unlinkAgent(name),
    onSuccess: (results) => {
      invalidate();
      setNotice(formatLinkMessage(results[0]));
    },
    onError: (err) =>
      setNotice(
        `取消链接失败：${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const list = agents ?? [];

  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* Header */}
      <div className="flex items-end justify-between pb-5">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
            我的 Agents
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            查看各 AI 编码代理的 skills 目录链接状态，并将它们的 skills
            目录链接到统一位置。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {/* Notice */}
      {notice && (
        <div className="mb-4 rounded-lg border border-border/70 bg-muted px-3.5 py-2.5 text-[12px] text-foreground">
          {notice}
        </div>
      )}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
        {isError ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Users className="h-8 w-8 opacity-40" />
            <p className="text-[13px]">
              加载失败：{error instanceof Error ? error.message : "未知错误"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void refetch()}
            >
              重试
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex h-full min-h-[260px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : list.length > 0 ? (
          <div className="flex flex-col gap-2">
            {list.map((agent) => (
              <AgentRow
                key={agent.name}
                agent={agent}
                linking={
                  (linkMutation.isPending &&
                    linkMutation.variables === agent.name) ||
                  (migrateMutation.isPending &&
                    migrateMutation.variables === agent.name)
                }
                unlinking={
                  unlinkMutation.isPending &&
                  unlinkMutation.variables === agent.name
                }
                onLink={() => linkMutation.mutate(agent.name)}
                onUnlink={() => unlinkMutation.mutate(agent.name)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <Users className="h-8 w-8 opacity-40" />
            <p className="text-[13px]">未检测到可用的 agent</p>
          </div>
        )}
      </div>

      <LinkMigrationDialog
        refused={pendingRefusal}
        installedNames={installedNames}
        migrating={migrateMutation.isPending}
        onConfirm={() => {
          if (pendingRefusal) migrateMutation.mutate(pendingRefusal.agent);
        }}
        onCancel={() => setPendingRefusal(null)}
      />
    </div>
  );
}
