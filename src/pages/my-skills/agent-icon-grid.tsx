import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleX,
  FolderOpen,
  Loader2,
  Trash2,
  Users,
} from "lucide-react";

import {
  fetchAgentStatus,
  linkAgent,
  removeAgentStrayFiles,
  unlinkAgent,
} from "../../lib/local-skills";
import {
  parseMigrateStrays,
  parseStrayDir,
  parseStrays,
} from "../../lib/link-migration";
import { openPathInSystem } from "../../lib/open-external";
import type { AgentLinkResult, AgentStatus } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { AgentIcon } from "../../components/agent-icon";
import { Button } from "../../components/ui/button";
import { StrayFilesDialog, type StrayFilesTarget } from "./stray-files-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

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
  onOpenDir,
  onMigrate,
  onRemove,
}: {
  agent: AgentStatus;
  busy: boolean;
  onClick: () => void;
  onOpenDir: (path: string) => void;
  onMigrate: () => void;
  onRemove: () => void;
}) {
  const skillCount = agent.internalSkills?.length ?? 0;
  const fileCount = agent.internalFiles?.length ?? 0;
  const dirPath = agent.dirPath ?? null;
  // 浮窗内的破坏性操作（导入/删除）先点一次进入"确认"态，再点一次才执行。
  const [confirming, setConfirming] = useState<"migrate" | "remove" | null>(
    null,
  );
  // canonical（规范目录本身）在数据上 linked=false，但对用户而言等价于已接入：
  // 图标保持全彩，点击时提示无法取消链接的原因。
  const isLinked = agent.linked || agent.canonical;
  const showBadge = !isLinked && skillCount > 0;
  const showFileBadge = !isLinked && fileCount > 0;
  // 目录内已有内容（skills 或其他文件）时只挂一个极简警告角标，不显示计数；
  // 具体文件清单在悬停浮窗与链接预览浮窗里展开。
  const showWarning = showBadge || showFileBadge;
  const disabled = busy;

  // 悬停浮窗文案按状态区分：说明、状态行（置底）。
  const dotColor = isLinked
    ? "bg-emerald-500"
    : showWarning
      ? "bg-amber-500"
      : "bg-muted-foreground";
  const statusText = isLinked ? "已链接" : "未链接";
  const description = isLinked
    ? "可使用所有已安装 skills"
    : showBadge
      ? `链接后,将自动导入以下 skills 并统一管理：`
      : "链接后,可使用所有已安装 skills";

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

      {showWarning && (
        // 极简警告角标：仅提示目录内已有内容（skills / 其他文件），不加计数，
        // 具体清单交给悬停浮窗与链接预览浮窗展开。感叹号用无圆环的 SVG 拼出
        // （竖条 + 圆点），避免 lucide 的 AlertCircle 在圆形徽章里形成双圆，
        // 也避免字体渲染把 "!" 看成数字 "1"。
        <span
          aria-label="该 agent 目录内已有 skills 或其他文件，点击查看详情"
          title="目录内已有 skills 或其他文件，点击查看详情"
          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-2 ring-card"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="h-3 w-3 text-white"
          >
            <path d="M12 3.5a2 2 0 0 0-2 2v9a2 2 0 0 0 4 0v-9a2 2 0 0 0-2-2Z" />
            <circle cx="12" cy="19.5" r="2" />
          </svg>
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
        <TooltipContent
          side="bottom"
          className="w-64 px-3 py-2.5"
          onPointerLeave={() => setConfirming(null)}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-popover-foreground">
              {agent.display}
            </p>
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
              {statusText}
            </span>
          </div>
          <div className="mt-1.5 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
            <p>{description}</p>

            {/* skills 段落：清单 + 一键导入 */}
            {showBadge && (
              <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/40 p-2.5">
                <p className="font-medium text-foreground">
                  可导入的 skills（{skillCount}）
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {(agent.internalSkills ?? []).map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
                {(fileCount === 0 || dirPath) && (
                  <Button
                    size="sm"
                    className="h-6 gap-1 px-2 text-[10px]"
                    onClick={() => {
                      if (confirming === "migrate") {
                        onMigrate();
                        setConfirming(null);
                      } else {
                        setConfirming("migrate");
                      }
                    }}
                  >
                    <ArrowRight className="h-3 w-3" />
                    {confirming === "migrate" ? "确认导入？" : "一键导入"}
                  </Button>
                )}
              </div>
            )}

            {/* 其他文件段落：清单 + 进入目录 / 一键删除 */}
            {showFileBadge && (
              <div className="space-y-1.5 rounded-lg border border-destructive/25 bg-destructive/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  需处理的其他文件（{fileCount}）
                </p>
                <ul className="list-disc space-y-0.5 pl-4 font-mono text-[10px]">
                  {(agent.internalFiles ?? []).map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
                {dirPath && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px]"
                      onClick={() => onOpenDir(dirPath)}
                    >
                      <FolderOpen className="h-3 w-3" />
                      进入目录
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px]"
                      onClick={() => {
                        if (confirming === "remove") {
                          onRemove();
                          setConfirming(null);
                        } else {
                          setConfirming("remove");
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                      {confirming === "remove" ? "确认删除？" : "一键删除"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AgentIconGrid() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [strayTarget, setStrayTarget] = useState<StrayFilesTarget | null>(null);
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

  /** Build the link-preview target for an agent, or `null` when its dir is empty. */
  const buildStrayTarget = (agent: AgentStatus): StrayFilesTarget | null => {
    const skills = agent.internalSkills ?? [];
    const files = agent.internalFiles ?? [];
    if (skills.length === 0 && files.length === 0) return null;
    return {
      name: agent.name,
      display: agent.display,
      skills,
      files,
      dirPath: agent.dirPath ?? null,
    };
  };

  const migrateMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name, { migrate: true }),
    onSuccess: (results) => {
      const result = results[0];
      if (result?.status === "failed") {
        // A migrate of a dir with non-skill files fails to move them; keep the
        // dialog open and refresh it with the strays the backend named.
        const files = parseMigrateStrays(result.message);
        if (files.length > 0) {
          setStrayTarget((current) =>
            current
              ? {
                  ...current,
                  files,
                  dirPath: parseStrayDir(result.message) ?? current.dirPath,
                }
              : {
                  // The dialog was already closed (e.g. a migrate from a direct
                  // click); rebuild it from the backend message so the user can
                  // clean up and retry.
                  name: result.agent,
                  display: result.display,
                  skills: [],
                  files,
                  dirPath: parseStrayDir(result.message),
                },
          );
          return;
        }
      }
      setStrayTarget(null);
      invalidate();
      setNotice(formatLinkMessage(result));
    },
  });

  const linkMutation = useMutation({
    mutationFn: (name: string) => linkAgent(name),
    onSuccess: (results) => {
      const result = results[0];
      if (result?.status === "refused") {
        // Strays block a plain link too; surface them in the dialog so the user
        // can delete or migrate them instead of linking again blindly.
        const skills = result.skills ?? [];
        const files = parseStrays(result.message, skills);
        const target = {
          name: result.agent,
          display: result.display,
          skills,
          files,
          dirPath: parseStrayDir(result.message),
        };
        if (target.files.length > 0 || target.skills.length > 0) {
          setStrayTarget(target);
          return;
        }
        migrateMutation.mutate(result.agent);
        return;
      }
      setStrayTarget(null);
      invalidate();
      setNotice(formatLinkMessage(result));
    },
    onError: (err) =>
      setNotice({
        text: `链接失败：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
      }),
  });

  /** 一键删除（hover tooltip）: remove the agent dir's strays, then refresh. */
  const handleRemoveStrays = async (agent: AgentStatus) => {
    const files = agent.internalFiles ?? [];
    const dirPath = agent.dirPath;
    if (files.length === 0 || !dirPath) {
      setNotice({
        text: "无法确定目录位置，请先手动处理这些文件",
        kind: "error",
      });
      return;
    }
    try {
      await removeAgentStrayFiles(dirPath, files);
      invalidate();
      setNotice({
        text: `已删除 ${agent.display} 目录中的 ${files.length} 个文件`,
        kind: "success",
      });
    } catch (err) {
      setNotice({
        text: `删除文件失败：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
      });
    }
  };

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
    // A dir that already holds skills or strays opens the preview dialog so the
    // user picks how to proceed; only an empty dir links directly.
    const target = buildStrayTarget(agent);
    if (target) {
      setStrayTarget(target);
      return;
    }
    linkMutation.mutate(agent.name);
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
              onOpenDir={(path) => void openPathInSystem(path)}
              onMigrate={() => migrateMutation.mutate(agent.name)}
              onRemove={() => void handleRemoveStrays(agent)}
            />
          ))}
        </div>
      )}

      <StrayFilesDialog
        target={strayTarget}
        onClose={() => setStrayTarget(null)}
      />
    </div>
  );
}
