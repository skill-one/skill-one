import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FolderOpen,
  Loader2,
  Trash2,
} from "lucide-react";

import type { AgentStatus } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { AgentIcon } from "../../components/agent-icon";
import { Button } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

/**
 * One agent's icon button with its hover tooltip: link status, the skills /
 * stray files living in the agent's own directory, and the in-tooltip actions
 * (一键导入 / 进入目录 / 一键删除). Destructive tooltip actions use a two-step
 * confirm: the first click arms the button, the second executes.
 */
export function AgentIconButton({
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
  // Destructive tooltip actions (import / delete) arm on the first click and
  // only execute on the second.
  const [confirming, setConfirming] = useState<"migrate" | "remove" | null>(
    null,
  );
  // The canonical dir itself reports linked=false, but to users it is
  // effectively linked: the icon stays full-color, and clicking explains
  // why it cannot be unlinked.
  const isLinked = agent.linked || agent.canonical;
  const showBadge = !isLinked && skillCount > 0;
  const showFileBadge = !isLinked && fileCount > 0;
  // When the dir already holds content (skills or other files), show only a
  // minimal warning badge — no count. The full lists live in the hover
  // tooltip and the link-preview dialog.
  const showWarning = showBadge || showFileBadge;
  const disabled = busy;

  // Hover tooltip copy varies by status: description plus a status line.
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
      {/* Link status is the primary signal: unlinked agents are grayed out,
          linked ones stay full-color. */}
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
        // Minimal warning badge: only hints that the dir already holds content
        // (skills / other files), no count — the lists live in the hover
        // tooltip and the link-preview dialog. The exclamation mark is drawn
        // as a ringless SVG (bar + dot) to keep lucide's AlertCircle from
        // forming a double circle inside the round badge, and to keep font
        // rendering from mistaking "!" for the digit "1".
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

            {/* Skills section: list + one-click import */}
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

            {/* Other-files section: list + open dir / one-click delete */}
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
