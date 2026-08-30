import { AlertTriangle, Archive, ArrowRight, FolderInput } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import type { PendingBackup } from "../../lib/skills-manager";

/** What the dialog shows before linking an agent whose dir already has content. */
export interface LinkConfirmTarget {
  name: string;
  display: string;
  /** Skills inside the agent's dir that confirming moves into the canonical dir. */
  skills: string[];
  /** Non-skill entries that cannot be imported; confirming parks them into the backup slot. */
  others: string[];
  /** Backup slot parked by a previous link, if any — linking is refused until it is handled. */
  backup?: PendingBackup | null;
}

/**
 * Link confirmation dialog. Clicking an agent whose skills dir already holds
 * content opens this instead of linking blindly. There is nothing to choose:
 * confirming links the agent and the backend handles the content. The dialog
 * is built around two emphatic segments that state exactly what confirming
 * will do — "以下 skill 将导入" (adopted into the canonical dir; name clashes
 * keep the canonical copy) and "以下文件将备份" (parked into the agent's
 * backup slot, restorable by unlink). The hover tooltip is the read-only
 * variant of the same preview.
 */
export function LinkConfirmDialog({
  target,
  busy,
  onConfirm,
  onClose,
}: {
  target: LinkConfirmTarget | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hasSkills = (target?.skills.length ?? 0) > 0;
  const hasOthers = (target?.others.length ?? 0) > 0;
  const backup = target?.backup ?? null;

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
              该 agent 的 skills 目录中已有内容。确认后会自动完成以下两步处理，无需其他操作：
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-[12px]">
            {hasSkills && (
              <div className="space-y-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-emerald-600">
                  <FolderInput className="h-3.5 w-3.5" />
                  以下 skill 将导入（{target.skills.length}）
                </p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-auto pl-4">
                  {target.skills.map((skill) => (
                    <li key={skill}>{skill}</li>
                  ))}
                </ul>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  移入全局 skills 目录统一管理；与全局同名的 skill 保留全局版本。
                </p>
              </div>
            )}

            {hasOthers && (
              <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-amber-600">
                  <Archive className="h-3.5 w-3.5" />
                  以下文件将备份（{target.others.length}）
                </p>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-auto pl-4 font-mono text-[10px]">
                  {target.others.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  这些文件无法导入，将备份到统一备份区，取消链接时自动恢复。
                </p>
              </div>
            )}

            {backup && backup.items.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-destructive/25 bg-destructive/5 p-2.5">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  备份待处理（{backup.items.length}）
                </p>
                <p className="font-mono text-[10px] break-all text-muted-foreground">
                  {backup.path}
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  备份区已有上次链接留下的内容；备份未处理前，确认链接会被拒绝。
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
            <Button size="sm" onClick={onConfirm} disabled={busy}>
              <ArrowRight className="h-3 w-3" />
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
