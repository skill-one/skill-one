import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, FolderOpen, Trash2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

/** What the dialog shows before linking an agent whose dir already has content. */
export interface StrayFilesTarget {
  name: string;
  display: string;
  /** Skills inside the agent's dir that an import would move into the canonical dir. */
  skills: string[];
  /** Non-skill files that must be removed before a link can succeed. */
  files: string[];
  /** Absolute path to the agent's skills dir; enables the 进入目录 action. */
  dirPath: string | null;
}

/**
 * Link decision dialog. Clicking an agent whose skills dir already holds
 * skills or non-skill files opens this instead of linking blindly. It is the
 * single surface that lists the existing content and owns the actions — the
 * hover tooltip only previews. Import moves directories and executes on one
 * click; deletion is irreversible, so its button arms on the first click and
 * executes on the second. Import stays disabled until every stray file is
 * gone, because a migrate aborts on non-skill entries.
 */
export function StrayFilesDialog({
  target,
  busy,
  onMigrate,
  onRemoveStrays,
  onOpenDir,
  onClose,
}: {
  target: StrayFilesTarget | null;
  busy: boolean;
  onMigrate: () => void;
  onRemoveStrays: () => void;
  onOpenDir: () => void;
  onClose: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // A new target identity marks a fresh dialog state: start disarmed.
  useEffect(() => setConfirmingRemove(false), [target]);

  const hasFiles = (target?.files.length ?? 0) > 0;
  const hasSkills = (target?.skills.length ?? 0) > 0;

  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target && (
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              链接 {target.display}（{target.name}）
            </DialogTitle>
            <DialogDescription>
              该 agent 的 skills 目录中已有内容，无法直接链接。请先处理以下内容：
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-[12px]">
            {hasSkills && (
              <div className="space-y-1.5 rounded-lg border border-border/70 bg-muted/40 p-2.5">
                <p className="font-medium text-foreground">
                  可导入的 skills（{target.skills.length}）
                </p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-auto pl-4">
                  {target.skills.map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  导入会把它们移动到全局 skills 目录统一管理；与全局目录同名的
                  skill 会被跳过（保留全局版本）。
                </p>
              </div>
            )}

            {hasFiles && (
              <div className="space-y-1.5 rounded-lg border border-destructive/25 bg-destructive/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  需先处理的其他文件（{target.files.length}）
                </p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-auto pl-4 font-mono text-[10px]">
                  {target.files.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  导入只移动 skill 目录，这些文件无法导入。删除后才能完成链接。
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={busy}
            >
              取消
            </Button>
            {target.dirPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenDir}
                disabled={busy}
              >
                <FolderOpen className="h-3 w-3" />
                进入目录
              </Button>
            )}
            {hasFiles && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirmingRemove) {
                    onRemoveStrays();
                    setConfirmingRemove(false);
                  } else {
                    setConfirmingRemove(true);
                  }
                }}
                disabled={busy}
              >
                <Trash2 className="h-3 w-3" />
                {confirmingRemove
                  ? "确认删除？"
                  : `删除 ${target.files.length} 个文件`}
              </Button>
            )}
            {hasSkills && (
              <Button
                size="sm"
                onClick={onMigrate}
                disabled={busy || hasFiles}
                title={hasFiles ? "请先删除上方其他文件" : undefined}
              >
                <ArrowRight className="h-3 w-3" />
                {hasFiles
                  ? "先处理其他文件"
                  : `导入 ${target.skills.length} 个 skills 并链接`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
