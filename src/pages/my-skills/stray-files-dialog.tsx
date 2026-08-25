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
  /** Absolute path to the agent's skills dir; used by the hover tooltip actions. */
  dirPath: string | null;
}

/**
 * Link guidance dialog. Clicking an agent whose skills dir already holds skills
 * or non-skill files opens this instead of linking blindly. The contents and
 * actions (一键导入 / 进入目录 / 一键删除) live in the agent's hover tooltip,
 * so this dialog only points the user there instead of duplicating the list.
 */
export function StrayFilesDialog({
  target,
  onClose,
}: {
  target: StrayFilesTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target && (
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              链接 {target.display}（{target.name}）
            </DialogTitle>
            <DialogDescription>
              该 agent 的 skills 目录中已有内容。请将鼠标悬停在该图标上，在浮窗中选择处理方式（一键导入
              skills、进入目录或一键删除文件）后完成链接。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
