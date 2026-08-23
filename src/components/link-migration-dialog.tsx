import { useMemo } from "react";
import { AlertTriangle, FolderSymlink, Link2, Loader2 } from "lucide-react";

import { classifySkills, parseStrays } from "../lib/link-migration";
import type { AgentLinkResult } from "../lib/skills-manager";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

/**
 * Asks the user whether to move the skills already sitting in an agent's own
 * directory into the canonical skills dir, which is what unblocks the link.
 *
 * Rendered from the `refused` result of a plain link attempt: `refused.skills`
 * lists what would move, while non-skill files are recovered from the reason
 * text. Migration cannot move loose files, so their presence blocks confirming.
 */
export function LinkMigrationDialog({
  refused,
  installedNames,
  migrating,
  onConfirm,
  onCancel,
}: {
  /** The refusal to act on; `null` keeps the dialog closed. */
  refused: AgentLinkResult | null;
  /** Skill names already present in the canonical dir (these get skipped). */
  installedNames: Iterable<string>;
  migrating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const skills = useMemo(
    () => classifySkills(refused?.skills ?? [], installedNames),
    [refused, installedNames],
  );
  const strays = useMemo(
    () => parseStrays(refused?.message, refused?.skills ?? []),
    [refused],
  );

  const blocked = strays.length > 0;
  const skipCount = skills.filter((skill) => skill.skipped).length;
  const moveCount = skills.length - skipCount;

  return (
    <Dialog
      open={refused != null}
      onOpenChange={(open) => {
        if (!open && !migrating) onCancel();
      }}
    >
      {refused && (
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>迁移并链接 skills</DialogTitle>
            <DialogDescription>
              {refused.display}（{refused.agent}）的 skills
              目录中已有内容，需要先把它们移动到统一的 skills 目录才能完成链接。
            </DialogDescription>
          </DialogHeader>

          {skills.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-foreground">
                  待迁移 skills
                </span>
                <span className="text-[11px] text-muted-foreground">
                  共 {skills.length} 个
                  {skipCount > 0 && `，将移动 ${moveCount} 个`}
                </span>
              </div>

              <ScrollArea className="max-h-[220px] rounded-lg border border-border/70 bg-background">
                <ul className="divide-y divide-border/60">
                  {skills.map((skill) => (
                    <li
                      key={skill.name}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      <FolderSymlink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
                        {skill.name}
                      </code>
                      {skill.skipped && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px] font-normal"
                        >
                          将跳过，保留规范目录版本
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>

              {skipCount > 0 && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  同名 skill 已存在于统一目录，迁移时会保留统一目录中的版本，原文件留在原处。
                </p>
              )}
            </div>
          )}

          {blocked && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                存在无法迁移的文件
              </div>
              <p className="text-[11px] leading-relaxed text-destructive/90">
                迁移只能移动 skill 目录。请先把以下文件移出该目录，然后重试链接：
              </p>
              <ul className="flex flex-wrap gap-1 pt-0.5">
                {strays.map((file) => (
                  <li
                    key={file}
                    className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-[11px] text-destructive"
                  >
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!blocked && skills.length === 0 && (
            <p className="rounded-lg border border-border/70 bg-muted px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
              {refused.message ?? "该目录中存在既有内容。"}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={migrating}
              onClick={onCancel}
            >
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              className="gap-1.5"
              disabled={blocked || migrating}
              onClick={onConfirm}
            >
              {migrating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              确认迁移
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
