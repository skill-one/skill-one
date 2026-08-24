import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleX,
  Loader2,
  Users,
} from "lucide-react";

import { fetchAgentStatus, linkAgent, unlinkAgent } from "../lib/local-skills";
import type { AgentLinkResult, AgentStatus } from "../lib/skills-manager";
import { cn } from "../lib/utils";
import { AgentIcon } from "./agent-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

type NoticeKind = "success" | "warning" | "error";

interface Notice {
  text: string;
  kind: NoticeKind;
}

/** 操作结果 → toast 语义色（成功绿 / 警告黄 / 错误红）。 */
function kindForStatus(status: AgentLinkResult["status"]): NoticeKind {
  switch (status) {
    case "linked":
    case "alreadyLinked":
    case "migrated":
    case "unlinked":
    case "skipped":
      return "success";
    case "refused":
    case "notLinked":
      return "warning";
    default:
      return "error";
  }
}

function formatLinkMessage(result: AgentLinkResult | undefined): Notice | null {
  if (!result) return null;
  const label = result.display;
  const kind = kindForStatus(result.status);
  switch (result.status) {
    case "linked":
      return { text: `${label} 已链接`, kind };
    case "alreadyLinked":
      return { text: `${label} 已链接过`, kind };
    case "migrated":
      return {
        text: `${label} 已迁移（移动 ${result.moved.length} 个，跳过 ${result.skipped.length} 个）`,
        kind,
      };
    case "refused":
      return {
        text: `${label} 拒绝：${result.message ?? "未提供原因"}`,
        kind,
      };
    case "skipped":
      return { text: `${label} 已跳过`, kind };
    case "failed":
      return {
        text: `${label} 失败：${result.message ?? "未知错误"}`,
        kind,
      };
    case "unlinked":
      return { text: `${label} 已取消链接`, kind };
    case "notLinked":
      return { text: `${label} 未链接`, kind };
    default:
      return null;
  }
}

function AgentIconButton({
  agent,
  busy,
  onClick,
}: {
  agent: AgentStatus;
  busy: boolean;
  onClick: () => void;
}) {
  const skillCount = agent.skills?.length ?? 0;
  // canonical（规范目录本身）在数据上 linked=false，但对用户而言等价于已接入：
  // 图标保持全彩，点击时提示无法取消链接的原因。
  const isLinked = agent.linked || agent.canonical;
  const showBadge = !isLinked && skillCount > 0;
  const disabled = busy;

  // 悬停浮窗文案按状态区分：说明、状态行（置底）。
  const dotColor = isLinked
    ? "bg-emerald-500"
    : showBadge
      ? "bg-amber-500"
      : "bg-muted-foreground";
  const statusText = isLinked ? "已链接" : "未链接";
  const description = isLinked
    ? "可使用已安装的所有 skills"
    : showBadge
      ? `目录内已有 ${skillCount} 个 skills，链接后将自动导入并统一管理：`
      : "链接后可使用已安装的所有 skills";

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${agent.display}${
        isLinked ? "，点击取消链接" : "，点击链接"
      }`}
      className={cn(
        "group relative flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-muted transition-all duration-150",
        "cursor-pointer hover:scale-105 hover:border-border hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.25)] active:scale-95",
      )}
    >
      {/* 链接状态是核心信息：未链接的 agent 整体淡灰，已链接的保持全彩。 */}
      <AgentIcon
        agentName={agent.name}
        className={cn(
          "h-7 w-7 transition-all duration-150",
          !isLinked && "opacity-40 grayscale",
          !isLinked &&
            "group-hover:opacity-80 group-hover:grayscale-[0.4] group-active:opacity-60",
        )}
      />

      {isLinked && (
        <span
          aria-label="已链接"
          title="已链接"
          className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-card"
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
        </span>
      )}

      {showBadge && (
        <span
          aria-label={`该 agent 目录内已有 ${skillCount} 个 skills`}
          title={`目录内已有 ${skillCount} 个 skills`}
          className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-card"
        >
          {skillCount}
        </span>
      )}

      {busy && (
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/70">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </span>
      )}
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="w-60 px-3 py-2.5">
          <p className="text-[12px] font-medium text-popover-foreground">
            {agent.display}
          </p>
          <div className="mt-1 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <p>{description}</p>
            {showBadge && (
              <ul className="list-disc space-y-0.5 pl-4">
                {(agent.skills ?? []).map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-[11px]">
            <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
            {statusText}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AgentIconGrid() {
  const [notice, setNotice] = useState<Notice | null>(null);
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
    queryClient.invalidateQueries({ queryKey: ["installed-skills"] });
  };

  const migrateMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name, { migrate: true }),
    onSuccess: (results) => {
      invalidate();
      setNotice(formatLinkMessage(results[0]));
    },
    onError: (err) =>
      setNotice({
        text: `迁移失败：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
      }),
  });

  const linkMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name),
    onSuccess: (results) => {
      const result = results[0];
      if (result?.status === "refused") {
        migrateMutation.mutate(result.agent);
        return;
      }
      invalidate();
      setNotice(formatLinkMessage(result));
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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleClick = (agent: AgentStatus) => {
    if (agent.canonical) {
      setNotice({
        text: `${agent.display} 使用原生 skills 目录，无法取消链接`,
        kind: "warning",
      });
      return;
    }
    if (agent.linked) {
      unlinkMutation.mutate(agent.name);
      return;
    }
    const skillCount = agent.skills?.length ?? 0;
    if (skillCount > 0) {
      migrateMutation.mutate(agent.name);
    } else {
      linkMutation.mutate(agent.name);
    }
  };

  const list = agents ?? [];
  const busyFor = (name: string) =>
    (linkMutation.isPending && linkMutation.variables === name) ||
    (migrateMutation.isPending && migrateMutation.variables === name) ||
    (unlinkMutation.isPending && unlinkMutation.variables === name);

  return (
    <div>
      {/* 操作结果以浮动 toast 呈现（fixed 定位），出现/消失不挤占布局空间。
          左侧彩色竖条 + 状态图标按操作类型区分：成功绿 / 警告黄 / 错误红。 */}
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
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <Users className="h-7 w-7 opacity-40" />
          <p className="text-[12px]">未检测到可用的 agent</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {list.map((agent) => (
            <AgentIconButton
              key={agent.name}
              agent={agent}
              busy={busyFor(agent.name)}
              onClick={() => handleClick(agent)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
