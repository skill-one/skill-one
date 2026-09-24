import { useState } from "react";
import { useTranslation } from "react-i18next";

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
 * badge; the user opens this dialog from that badge (or the settings popover's
 * 软件更新 row), and the dialog is shown while `available` + `dialogOpen`. Closing keeps the
 * `available` phase (via the store's close action) so the badge persists as a
 * reminder. Install streams progress from the updater plugin; on success the app
 * relaunches into the new bundle, so this component unmounts with it.
 */
export function UpdateDialog() {
  const { phase, version, notes, dialogOpen, close: closeDialog, install } =
    useAppUpdate();
  const { t } = useTranslation();
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
            {t("update.dialogTitle", { version })}
          </DialogTitle>
          <DialogDescription>
            {installing ? t("update.downloadingHint") : t("update.readyHint")}
          </DialogDescription>
        </DialogHeader>

        {installing ? (
          <div className="flex flex-col gap-2">
            <Progress value={percent ?? 0} />
            <p className="text-right text-[12px] text-muted-foreground">
              {percent === null ? t("update.downloading") : `${percent}%`}
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
            {t("update.failedLabel", { message: failure })}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={installing}>
            {t("update.later")}
          </Button>
          <Button onClick={() => void startInstall()} disabled={installing}>
            {installing
              ? t("update.updating")
              : failure
                ? t("update.retryUpdate")
                : t("update.updateNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
