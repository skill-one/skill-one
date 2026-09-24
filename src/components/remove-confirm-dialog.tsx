import { Loader2, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/**
 * The one ask the app puts before an uninstall — the shared shell every
 * removal control opens instead of acting on its first press.
 *
 * Removal is not recoverable from the app (only by reinstalling), so every
 * scale of it pays the same second press: the dialog names what will go, and
 * only a destructive confirm acts. What differs by scale is the description —
 * the count a whole repository carries, the bare act a single skill needs —
 * and the `names` list, which only earns its room when the reader could not
 * otherwise see which skills are in the batch.
 */
export function RemoveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  names,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the ask is about — the skill or repository the press named. */
  title: string;
  /** What will happen, and what it costs. */
  description: string;
  /** The names the batch covers, when they are more than the title already
   *  says; rendered as a scroll list so a large batch does not stretch the
   *  dialog. */
  names?: readonly string[];
  /** While the write runs: both footers wait, and the confirm shows motion. */
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {names && names.length > 0 && (
          <ul className="max-h-40 overflow-y-auto rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Trash2 aria-hidden />
            )}
            移除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
