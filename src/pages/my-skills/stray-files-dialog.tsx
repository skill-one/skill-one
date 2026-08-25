import { AlertTriangle, FolderOpen } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

/** What the dialog shows: which agent is blocked, by which non-skill files. */
export interface StrayFilesTarget {
  name: string;
  display: string;
  /** Non-skill file names that must be removed by hand. */
  files: string[];
  /** Absolute path to the agent's skills dir; `null` hides the open button. */
  dirPath: string | null;
}

/**
 * Explains why a link could not be created when the agent's skills dir holds
 * non-skill files. Migration only moves skill directories, so these strays
 * must be removed by hand; the dialog lists them and offers to reveal the dir
 * in the file manager.
 */
export function StrayFilesDialog({
  target,
  onOpenDir,
  onClose,
}: {
  target: StrayFilesTarget | null;
  onOpenDir: (path: string) => void;
  onClose: () => void;
}) {
  const dirPath = target?.dirPath ?? null;
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
            <DialogTitle>链接失败：存在无法迁移的文件</DialogTitle>
            <DialogDescription>
              {target.display}（{target.name}）的 skills 目录中带有非 skill
              文件，链接无法自动清理它们。
              {dirPath && (
                <>
                  {" "}
                  目录：
                  <strong className="select-all font-semibold text-foreground">
                    {dirPath}
                  </strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              需要手动移除这些文件后重试
            </div>
            <ul className="flex flex-wrap gap-1 pt-0.5">
              {target.files.map((file) => (
                <li
                  key={file}
                  className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-[11px] text-destructive"
                >
                  {file}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              知道了
            </Button>
            {dirPath && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => onOpenDir(dirPath)}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                打开目录
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
