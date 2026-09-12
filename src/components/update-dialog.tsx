import { useState } from "react";

import { useAppUpdate } from "../hooks/use-app-update";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Progress } from "./ui/progress";

/**
 * Self-update confirmation dialog. It does NOT open itself: a background or
 * startup check only flips the store to `available`, which surfaces the sidebar
 * badge; the user opens this dialog from that badge (or the settings page), and
 * the dialog is shown while `available` + `dialogOpen`. Closing keeps the
 * `available` phase (via the store's close action) so the badge persists as a
 * reminder. Install streams progress from the updater plugin; on success the app
 * relaunches into the new bundle, so this component unmounts with it.
 */
export function UpdateDialog() {
  const { phase, version, notes, dialogOpen, close: closeDialog, install } =
    useAppUpdate();
  // `null` = the download reported no total size, so there is no percentage to
  // show; the label says "downloading" instead of pretending it is 0%.
  const [percent, setPercent] = useState<number | null>(0);
  const [installing, setInstalling] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const handleClose = () => {
    if (!installing) closeDialog();
  };

  const startInstall = async () => {
    setInstalling(true);
    setFailure(null);
    setPercent(0);
    try {
      await install(setPercent);
      // Success ends in relaunch(); nothing to clean up.
    } catch (error) {
      setInstalling(false);
      setFailure(String(error));
    }
  };

  return (
    <Dialog
      open={phase === "available" && dialogOpen}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent showCloseButton={!installing}>
        <DialogHeader>
          <DialogTitle>
            更新到 v{version}
          </DialogTitle>
          <DialogDescription>
            {installing
              ? "正在下载并安装更新，完成后应用会自动重启…"
              : "新版本已准备就绪，安装过程中应用会短暂重启。"}
          </DialogDescription>
        </DialogHeader>

        {installing ? (
          <div className="flex flex-col gap-2">
            <Progress value={percent ?? 0} />
            <p className="text-right text-[12px] text-muted-foreground">
              {percent === null ? "正在下载…" : `${percent}%`}
            </p>
          </div>
        ) : (
          notes && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap">
              {notes}
            </div>
          )
        )}

        {failure && (
          <p role="alert" className="text-[12px] text-destructive">
            更新失败：{failure}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={installing}>
            稍后再说
          </Button>
          <Button onClick={() => void startInstall()} disabled={installing}>
            {installing
              ? "正在更新…"
              : failure
                ? "重试更新"
                : "立即更新"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
