import { useEffect, useState } from "react";

import { addProject } from "../lib/projects";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";

/**
 * Browser fallback for adding a project directory: a manual absolute-path input.
 *
 * The desktop shell picks a folder natively (see `pickProjectDir`); a plain
 * browser has no such dialog, so this lets the user type the project root
 * instead. Controlled by an `open` flag so a caller can trigger it from any
 * affordance (a card's scope menu, the Settings page) and share one instance.
 */
export function AddProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [path, setPath] = useState("");

  useEffect(() => {
    if (open) setPath("");
  }, [open]);

  const submit = () => {
    const trimmed = path.trim();
    if (trimmed) addProject(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加项目</DialogTitle>
          <DialogDescription>
            输入项目目录的绝对路径，项目级技能会安装到该目录下的
            <code className="mx-1 rounded bg-muted px-1">.agents/skills</code>。
          </DialogDescription>
        </DialogHeader>
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="/Users/you/my-project"
          aria-label="项目目录路径"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={!path.trim()}>
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
