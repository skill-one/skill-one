import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "./ui/toast";

import { removeInstalledSkill } from "../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../hooks/use-installed-skills";
import { errorMessage } from "../lib/utils";
import type { Skill } from "../types/skill";
import { Button } from "./ui/button";
import { RemoveConfirmDialog } from "./remove-confirm-dialog";

/**
 * The uninstall action — the counterpart of `SkillInstallButton`, and the only
 * uninstall entry point for a single skill.
 *
 * It used to sit on every card of the installed list: 8px from the enable
 * switch, on a surface where the whole card is a click target too. Removing a
 * skill is not recoverable from the app (only by reinstalling it), so it
 * lives here instead: one deliberate step — the user opens the skill. The step
 * no longer stands in for the confirmation, though — a batch removal the
 * reader reaches from a repository's head pays the same second press (see
 * `RemoveConfirmDialog`) — so the single removal does too: the press opens the
 * ask, and only a destructive confirm acts. The cards stay a reading surface.
 *
 * Renders only while the skill is on disk, so a surface can hand it the same
 * skill it gives the install button and let the installed state pick. That
 * match is by name, because removal is by name all the way down
 * (`remove_skills` takes names).
 */
export function SkillRemoveButton({
  skill,
  className,
  onRemoved,
}: {
  skill: Skill;
  /** Merged onto the button; callers place it. */
  className?: string;
  /** Called after the skill is gone; a list-backed caller closes its panel. */
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const queryClient = useQueryClient();
  const { data: installed } = useInstalledSkills();
  const onDisk = installed?.some((s) => s.name === skill.name) ?? false;

  if (!onDisk) return null;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await removeInstalledSkill(skill.name);
      // Same broadcast the batch removal makes: the my-skills list, the
      // sidebar count and the menu bar popover all read this one signal.
      await markSkillsChanged(queryClient);
      toast.add({ title: `已移除 ${skill.name}`, type: "success" });
      setOpen(false);
      onRemoved?.();
    } catch (err) {
      toast.add({ title: errorMessage(err, "移除失败"), type: "error" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        title="移除"
        onClick={(e) => {
          setOpen(true);
          e.stopPropagation();
        }}
        className={className}
      >
        <Trash2 className="h-3.5 w-3.5" />
        移除
      </Button>

      <RemoveConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`移除 ${skill.name}？`}
        description="将从本机卸载该 skill。此操作无法从应用内撤销；之后可随时重新安装。"
        pending={removing}
        onConfirm={() => void handleRemove()}
      />
    </>
  );
}
