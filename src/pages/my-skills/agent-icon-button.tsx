import {
  AlertTriangle,
  Archive,
  Check,
  FolderInput,
  Loader2,
} from "lucide-react";

import type { AgentStatus } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { AgentIcon } from "../../components/agent-icon";
import { agentLinkState, agentStateLabel } from "./agent-link-state";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

/** Hover lists are capped; the full lists live in the link-preview dialog. */
const TOOLTIP_LIST_CAP = 5;

/**
 * One agent's icon button with its read-only hover tooltip: link status plus a
 * preview of the private content inside the agent's own directory. The preview
 * reuses the link confirm dialog's two emphatic segments (以下 skill 将导入 /
 * 以下文件将备份) so hover and click tell one story; all actions live in the
 * dialog that opens on click — never in this transient hover layer.
 */
export function AgentIconButton({
  agent,
  busy,
  onClick,
}: {
  agent: AgentStatus;
  busy: boolean;
  onClick: () => void;
}) {
  const skillCount = agent.internalSkills?.length ?? 0;
  const fileCount = agent.internalOthers?.length ?? 0;
  const backupItems = agent.pendingBackup?.items ?? [];
  const state = agentLinkState(agent);
  const isLinked = state === "linked";
  const showWarning = state === "warning";
  const disabled = busy;

  // Hover tooltip copy varies by status: description plus a status line.
  const dotColor = isLinked
    ? "bg-emerald-500"
    : showWarning
      ? "bg-amber-500"
      : "bg-muted-foreground";
  const statusText = agentStateLabel(agent);
  const description = agent.canonical
    ? "原生使用全局 skills 目录，始终可用所有已安装 skills"
    : isLinked
      ? backupItems.length > 0
        ? "已链接；有内容等待处理"
        : "可使用所有已安装 skills"
      : showWarning
        ? "目录中已有内容，确认链接后自动导入与备份"
        : "链接后,可使用所有已安装 skills";

  const ariaLabel = agent.canonical
    ? `${agent.display}，原生使用全局 skills 目录`
    : isLinked
      ? `${agent.display}，点击取消链接`
      : `${agent.display}，点击链接`;

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-muted transition-all duration-150",
        // A canonical agent offers no toggle: no hover/press affordance.
        !agent.canonical &&
          "cursor-pointer hover:scale-105 hover:border-border hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.25)] active:scale-95",
        agent.canonical && "cursor-default",
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
        <TooltipContent side="bottom" className="w-64 px-3 py-2.5">
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

            {/* Read-only preview of what confirming will import — same two
                emphatic segments as the link confirm dialog. */}
            {!isLinked && skillCount > 0 && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-emerald-600">
                  <FolderInput className="h-3 w-3" />
                  以下 skill 将导入（{skillCount}）
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {(agent.internalSkills ?? [])
                    .slice(0, TOOLTIP_LIST_CAP)
                    .map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                </ul>
                {skillCount > TOOLTIP_LIST_CAP && (
                  <p className="pl-4 text-[10px]">…等 {skillCount} 个</p>
                )}
              </div>
            )}

            {!isLinked && fileCount > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-amber-600">
                  <Archive className="h-3 w-3" />
                  以下文件将备份（{fileCount}）
                </p>
                <ul className="list-disc space-y-0.5 pl-4 font-mono text-[10px]">
                  {(agent.internalOthers ?? [])
                    .slice(0, TOOLTIP_LIST_CAP)
                    .map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                </ul>
                {fileCount > TOOLTIP_LIST_CAP && (
                  <p className="pl-4 text-[10px]">…等 {fileCount} 个</p>
                )}
              </div>
            )}

            {/* Read-only preview of content parked by a previous link. */}
            {backupItems.length > 0 && (
              <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  备份待处理（{backupItems.length}）
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {backupItems.slice(0, TOOLTIP_LIST_CAP).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {backupItems.length > TOOLTIP_LIST_CAP && (
                  <p className="pl-4 text-[10px]">…等 {backupItems.length} 个</p>
                )}
                <p className="text-[10px]">
                  {isLinked
                    ? "取消链接时自动恢复原内容。"
                    : "处理备份前，链接会被拒绝。"}
                </p>
              </div>
            )}

            {showWarning && (
              <p className="text-[10px]">点击图标确认链接，自动完成导入与备份。</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
