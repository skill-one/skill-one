import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleX, Loader2, Users } from "lucide-react";

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
import type { AgentStatus } from "../../lib/skills-manager";
import { cn } from "../../lib/utils";
import { AgentIconButton } from "./agent-icon-button";
import { formatLinkMessage, type Notice } from "./link-notice";
import { StrayFilesDialog, type StrayFilesTarget } from "./stray-files-dialog";

/**
 * The agent-link strip on the "my skills" page: one icon per agent, plus the
 * mutations behind it (link / migrate / unlink / stray cleanup), the result
 * toasts and the link decision dialog. Division of labor: the icon's hover
 * tooltip is a read-only preview; clicking a dir that already holds content
 * opens the decision dialog, which owns all actions. Toast wording lives in
 * `link-notice.ts`.
 */
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
                  // The dialog was closed before the migrate finished; rebuild
                  // it from the backend message so the user can clean up and
                  // retry.
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
        // The status snapshot was stale: the dir gained content between fetch
        // and click. Always show the decision dialog — never migrate without
        // the user seeing (and choosing on) what is in the dir. Stray files
        // only appear inside the refusal text, so they are parsed from it
        // until the backend exposes them as structured fields.
        const skills = result.skills ?? [];
        setStrayTarget({
          name: result.agent,
          display: result.display,
          skills,
          files: parseStrays(result.message, skills),
          dirPath: parseStrayDir(result.message),
        });
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

  /** One-click stray deletion from the decision dialog, then refresh. */
  const removeStraysMutation = useMutation({
    mutationFn: (target: StrayFilesTarget) => {
      if (!target.dirPath || target.files.length === 0) {
        return Promise.reject(
          new Error("无法确定目录位置，请先手动处理这些文件"),
        );
      }
      return removeAgentStrayFiles(target.dirPath, target.files);
    },
    onSuccess: (removed, target) => {
      invalidate();
      setNotice({
        text: `已删除 ${target.display} 目录中的 ${removed.length} 个文件`,
        kind: "success",
      });
      // The dialog opened from a link click, so finishing the link is the
      // user's standing intent: with nothing left to import, link directly;
      // otherwise keep the dialog open for the import step.
      if (target.skills.length === 0) {
        setStrayTarget(null);
        linkMutation.mutate(target.name);
      } else {
        setStrayTarget((current) =>
          current && current.name === target.name
            ? { ...current, files: [] }
            : current,
        );
      }
    },
    onError: (err) =>
      setNotice({
        text: `删除文件失败：${err instanceof Error ? err.message : String(err)}`,
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
    // A dir that already holds skills or strays opens the decision dialog so
    // the user picks how to proceed; only an empty dir links directly.
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
  const dialogBusy = strayTarget
    ? busyFor(strayTarget.name) || removeStraysMutation.isPending
    : false;

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

      <StrayFilesDialog
        target={strayTarget}
        busy={dialogBusy}
        onMigrate={() => {
          if (strayTarget) migrateMutation.mutate(strayTarget.name);
        }}
        onRemoveStrays={() => {
          if (strayTarget) removeStraysMutation.mutate(strayTarget);
        }}
        onOpenDir={() => {
          if (strayTarget?.dirPath) void openPathInSystem(strayTarget.dirPath);
        }}
        onClose={() => setStrayTarget(null)}
      />
    </div>
  );
}
